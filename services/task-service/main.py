from fastapi import FastAPI, Depends, HTTPException, status, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, date
from typing import Optional, List
from jose import JWTError, jwt
import asyncpg
import httpx
import os
import json
from pydantic import BaseModel
from enum import Enum
from aiokafka import AIOKafkaProducer

app = FastAPI(title="Task Service", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Config
SECRET_KEY = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://user-service:3001")
TEAM_SERVICE_URL = os.getenv("TEAM_SERVICE_URL", "http://team-service:3002")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/nefos")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

db_pool: Optional[asyncpg.Pool] = None
kafka_producer: Optional[AIOKafkaProducer] = None

# Enums
class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    in_review = "in_review"
    done = "done"

class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

# Models
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    team_id: int
    assignee_id: Optional[int] = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    due_date: Optional[date] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[date] = None

class CommentCreate(BaseModel):
    content: str

class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    team_id: int
    team_name: Optional[str]
    assignee_id: Optional[int]
    assignee_name: Optional[str]
    reporter_id: int
    reporter_name: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[date]
    created_at: datetime
    updated_at: datetime
    comments: Optional[List[dict]] = None

class CommentResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    user_name: Optional[str]
    content: str
    created_at: datetime

# Database
@app.on_event("startup")
async def startup():
    global db_pool, kafka_producer
    db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=5, max_size=20)
    
    # Initialize Kafka producer
    kafka_producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    await kafka_producer.start()

@app.on_event("shutdown")
async def shutdown():
    global kafka_producer
    if db_pool:
        await db_pool.close()
    if kafka_producer:
        await kafka_producer.stop()

async def get_db():
    async with db_pool.acquire() as conn:
        yield conn

# Auth
async def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id: int = int(user_id_str)
        return user_id
    except (JWTError, ValueError, TypeError) as e:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(
    user_id: int = Depends(verify_token),
    conn: asyncpg.Connection = Depends(get_db)
):
    user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(user)

async def is_team_member(team_id: int, user_id: int, conn: asyncpg.Connection) -> bool:
    result = await conn.fetchrow(
        "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id, user_id
    )
    return result is not None

async def is_team_leader(team_id: int, user_id: int, conn: asyncpg.Connection) -> bool:
    team = await conn.fetchrow("SELECT leader_id FROM teams WHERE id = $1", team_id)
    return team and team["leader_id"] == user_id

# Routes
@app.get("/")
async def root():
    return {"service": "Task Service", "version": "1.0.0", "status": "running"}

@app.get("/api/tasks", response_model=List[TaskResponse])
async def get_all_tasks(
    status_filter: Optional[TaskStatus] = Query(None, alias="status"),
    team_id: Optional[int] = Query(None, alias="teamId"),
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db)
):
    # Admins can see all tasks
    if current_user["role"] == "admin":
        query = """
            SELECT t.*,
                   team.name as team_name,
                   assignee.first_name || ' ' || assignee.last_name as assignee_name,
                   reporter.first_name || ' ' || reporter.last_name as reporter_name
            FROM tasks t
            LEFT JOIN teams team ON t.team_id = team.id
            LEFT JOIN users assignee ON t.assignee_id = assignee.id
            LEFT JOIN users reporter ON t.reporter_id = reporter.id
            WHERE 1=1
        """
        params = []
        param_count = 1
    else:
        # Regular users see tasks from their teams (member or leader) OR tasks assigned to them OR tasks they created
        query = """
            SELECT t.*,
                   team.name as team_name,
                   assignee.first_name || ' ' || assignee.last_name as assignee_name,
                   reporter.first_name || ' ' || reporter.last_name as reporter_name
            FROM tasks t
            LEFT JOIN teams team ON t.team_id = team.id
            LEFT JOIN users assignee ON t.assignee_id = assignee.id
            LEFT JOIN users reporter ON t.reporter_id = reporter.id
            WHERE (
                t.team_id IN (
                    SELECT team_id FROM team_members WHERE user_id = $1
                )
                OR t.team_id IN (
                    SELECT id FROM teams WHERE leader_id = $1
                )
                OR t.assignee_id = $1
                OR t.reporter_id = $1
            )
        """
        params = [current_user["id"]]
        param_count = 2
    
    if status_filter:
        query += f" AND t.status = ${param_count}"
        params.append(status_filter.value)
        param_count += 1
    
    if team_id:
        query += f" AND t.team_id = ${param_count}"
        params.append(team_id)
        param_count += 1
    
    query += " ORDER BY t.created_at DESC"
    
    tasks = await conn.fetch(query, *params)
    return [dict(task) for task in tasks]

@app.get("/api/tasks/my-tasks", response_model=List[TaskResponse])
async def get_my_tasks(
    status_filter: Optional[TaskStatus] = Query(None, alias="status"),
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db)
):
    query = """
        SELECT t.*,
               team.name as team_name,
               assignee.first_name || ' ' || assignee.last_name as assignee_name,
               reporter.first_name || ' ' || reporter.last_name as reporter_name
        FROM tasks t
        LEFT JOIN teams team ON t.team_id = team.id
        LEFT JOIN users assignee ON t.assignee_id = assignee.id
        LEFT JOIN users reporter ON t.reporter_id = reporter.id
        WHERE t.assignee_id = $1
    """
    
    params = [current_user["id"]]
    
    if status_filter:
        query += " AND t.status = $2"
        params.append(status_filter.value)
    
    query += " ORDER BY t.created_at DESC"
    
    tasks = await conn.fetch(query, *params)
    return [dict(task) for task in tasks]

@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db)
):
    task = await conn.fetchrow(
        """
        SELECT t.*,
               team.name as team_name,
               assignee.first_name || ' ' || assignee.last_name as assignee_name,
               assignee.email as assignee_email,
               reporter.first_name || ' ' || reporter.last_name as reporter_name,
               reporter.email as reporter_email
        FROM tasks t
        LEFT JOIN teams team ON t.team_id = team.id
        LEFT JOIN users assignee ON t.assignee_id = assignee.id
        LEFT JOIN users reporter ON t.reporter_id = reporter.id
        WHERE t.id = $1
        """,
        task_id
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if user has access (must be team member or leader)
    is_member = await is_team_member(task["team_id"], current_user["id"], conn)
    is_leader = await is_team_leader(task["team_id"], current_user["id"], conn)
    if not is_member and not is_leader and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get comments
    comments = await conn.fetch(
        """
        SELECT c.*,
               u.first_name || ' ' || u.last_name as user_name,
               u.email as user_email
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.task_id = $1
        ORDER BY c.created_at DESC
        """,
        task_id
    )
    
    task_dict = dict(task)
    task_dict["comments"] = [dict(c) for c in comments]
    
    return task_dict

@app.post("/api/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task: TaskCreate,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db)
):
    # Check if user is team leader or admin
    is_leader = await is_team_leader(task.team_id, current_user["id"], conn)
    if not is_leader and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only team leaders can create tasks")
    
    # Verify team exists
    team = await conn.fetchrow("SELECT id, name FROM teams WHERE id = $1", task.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # If assignee specified, verify they're a team member
    if task.assignee_id:
        is_member = await is_team_member(task.team_id, task.assignee_id, conn)
        if not is_member:
            raise HTTPException(status_code=400, detail="Assignee must be a team member")
    
    new_task = await conn.fetchrow(
        """
        INSERT INTO tasks (
            title, description, team_id, assignee_id, reporter_id,
            status, priority, due_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        """,
        task.title, task.description, task.team_id, task.assignee_id,
        current_user["id"], task.status.value, task.priority.value, task.due_date
    )
    
    # Get names
    result = dict(new_task)
    result["team_name"] = team["name"]
    result["reporter_name"] = f"{current_user['first_name']} {current_user['last_name']}"
    
    if task.assignee_id:
        assignee = await conn.fetchrow(
            "SELECT first_name, last_name FROM users WHERE id = $1",
            task.assignee_id
        )
        if assignee:
            result["assignee_name"] = f"{assignee['first_name']} {assignee['last_name']}"
            
            # Send Kafka notification for task assignment
            await kafka_producer.send_and_wait(
                'task-notifications',
                {
                    'user_id': task.assignee_id,
                    'type': 'task_assigned',
                    'title': 'New Task Assigned',
                    'message': f'You have been assigned to task: {task.title}',
                    'task_id': new_task['id']
                }
            )
    
    return result

@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_update: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db)
):
    # Get existing task
    existing_task = await conn.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check permissions - admins cannot edit tasks
    is_leader = await is_team_leader(existing_task["team_id"], current_user["id"], conn)
    is_assignee = existing_task["assignee_id"] == current_user["id"]
    
    # If user is only the assignee (not leader), they can only update status
    if is_assignee and not is_leader:
        # Check if trying to update anything other than status
        if (task_update.title is not None or 
            task_update.description is not None or 
            task_update.assignee_id is not None or 
            task_update.priority is not None or 
            task_update.due_date is not None):
            raise HTTPException(status_code=403, detail="Assignees can only update task status")
    elif not is_leader:
        raise HTTPException(status_code=403, detail="Only team leaders or assignees can update tasks")
    
    update_fields = []
    values = []
    param_count = 1
    
    if task_update.title:
        update_fields.append(f"title = ${param_count}")
        values.append(task_update.title)
        param_count += 1
    
    if task_update.description is not None:
        update_fields.append(f"description = ${param_count}")
        values.append(task_update.description)
        param_count += 1
    
    if task_update.assignee_id is not None:
        # Verify assignee is team member
        if task_update.assignee_id:
            is_member = await is_team_member(existing_task["team_id"], task_update.assignee_id, conn)
            if not is_member:
                raise HTTPException(status_code=400, detail="Assignee must be a team member")
        
        update_fields.append(f"assignee_id = ${param_count}")
        values.append(task_update.assignee_id)
        param_count += 1
    
    if task_update.status:
        update_fields.append(f"status = ${param_count}")
        values.append(task_update.status.value)
        param_count += 1
    
    if task_update.priority:
        update_fields.append(f"priority = ${param_count}")
        values.append(task_update.priority.value)
        param_count += 1
    
    if task_update.due_date is not None:
        update_fields.append(f"due_date = ${param_count}")
        values.append(task_update.due_date)
        param_count += 1
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_fields.append("updated_at = CURRENT_TIMESTAMP")
    values.append(task_id)
    
    query = f"""
        UPDATE tasks 
        SET {', '.join(update_fields)}
        WHERE id = ${param_count}
        RETURNING *
    """
    
    updated_task = await conn.fetchrow(query, *values)
    
    # Get related data
    task_with_details = await conn.fetchrow(
        """
        SELECT t.*,
               team.name as team_name,
               assignee.first_name || ' ' || assignee.last_name as assignee_name,
               reporter.first_name || ' ' || reporter.last_name as reporter_name
        FROM tasks t
        LEFT JOIN teams team ON t.team_id = team.id
        LEFT JOIN users assignee ON t.assignee_id = assignee.id
        LEFT JOIN users reporter ON t.reporter_id = reporter.id
        WHERE t.id = $1
        """,
        task_id
    )
    
    # Send Kafka notifications for changes
    # Notify if assignee changed
    if task_update.assignee_id is not None and task_update.assignee_id != existing_task["assignee_id"]:
        if task_update.assignee_id:
            await kafka_producer.send_and_wait(
                'task-notifications',
                {
                    'user_id': task_update.assignee_id,
                    'type': 'task_assigned',
                    'title': 'New Task Assigned',
                    'message': f'You have been assigned to task: {updated_task["title"]}',
                    'task_id': task_id
                }
            )
    
    # Notify if status changed
    if task_update.status and task_update.status.value != existing_task["status"]:
        # Notify assignee if they didn't make the change
        if existing_task["assignee_id"] and existing_task["assignee_id"] != current_user["id"]:
            await kafka_producer.send_and_wait(
                'task-notifications',
                {
                    'user_id': existing_task["assignee_id"],
                    'type': 'task_status_changed',
                    'title': 'Task Status Updated',
                    'message': f'Task "{updated_task["title"]}" status changed to {task_update.status.value.replace("_", " ").title()}',
                    'task_id': task_id
                }
            )
    
    # Notify if priority changed
    if task_update.priority and task_update.priority.value != existing_task["priority"]:
        # Notify assignee if they didn't make the change
        if existing_task["assignee_id"] and existing_task["assignee_id"] != current_user["id"]:
            await kafka_producer.send_and_wait(
                'task-notifications',
                {
                    'user_id': existing_task["assignee_id"],
                    'type': 'task_priority_changed',
                    'title': 'Task Priority Updated',
                    'message': f'Task "{updated_task["title"]}" priority changed to {task_update.priority.value.title()}',
                    'task_id': task_id
                }
            )
    
    return dict(task_with_details)

@app.delete("/api/tasks/{task_id}")
async def delete_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db)
):
    # Get existing task
    existing_task = await conn.fetchrow("SELECT team_id FROM tasks WHERE id = $1", task_id)
    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if user is team leader - admins cannot delete tasks
    is_leader = await is_team_leader(existing_task["team_id"], current_user["id"], conn)
    if not is_leader:
        raise HTTPException(status_code=403, detail="Only team leaders can delete tasks")
    
    result = await conn.execute("DELETE FROM tasks WHERE id = $1", task_id)
    
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {"message": "Task deleted successfully"}

@app.post("/api/tasks/{task_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    task_id: int,
    comment: CommentCreate,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db)
):
    # Verify task exists and user has access
    task = await conn.fetchrow("SELECT team_id FROM tasks WHERE id = $1", task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if user is team member
    is_member = await is_team_member(task["team_id"], current_user["id"], conn)
    if not is_member and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    new_comment = await conn.fetchrow(
        """
        INSERT INTO comments (task_id, user_id, content)
        VALUES ($1, $2, $3)
        RETURNING *
        """,
        task_id, current_user["id"], comment.content
    )
    
    result = dict(new_comment)
    result["user_name"] = f"{current_user['first_name']} {current_user['last_name']}"
    
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3003)
