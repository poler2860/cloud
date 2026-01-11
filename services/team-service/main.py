from fastapi import FastAPI, Depends, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from typing import Optional, List
from jose import JWTError, jwt
from pydantic import BaseModel
import asyncpg
import os
import httpx

app = FastAPI(title="Team Service", version="1.0.0")

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
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/nefos")

db_pool: Optional[asyncpg.Pool] = None

# Models
class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None

class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class TeamResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_by: int
    created_at: datetime
    member_count: Optional[int] = 0
    members: Optional[List[dict]] = None

class MemberAdd(BaseModel):
    user_id: int

# Database
@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=5, max_size=20)

@app.on_event("shutdown")
async def shutdown():
    if db_pool:
        await db_pool.close()

async def get_db():
    async with db_pool.acquire() as conn:
        yield conn

# Auth
def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return int(user_id_str)
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

# Helper functions
async def get_user_info(user_id: int) -> Optional[dict]:
    """Fetch user info from user service"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{USER_SERVICE_URL}/users/{user_id}")
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        print(f"Error fetching user info: {e}")
    return None

async def enrich_team_with_members(team: dict, conn) -> dict:
    """Add member information to team"""
    members_data = await conn.fetch(
        "SELECT user_id FROM team_members WHERE team_id = $1",
        team["id"]
    )
    
    team["member_count"] = len(members_data)
    
    # Fetch user details for each member
    members = []
    for member in members_data:
        user_info = await get_user_info(member["user_id"])
        if user_info:
            members.append({
                "id": user_info["id"],
                "full_name": user_info["full_name"],
                "email": user_info["email"]
            })
    
    team["members"] = members
    return team

# Routes
@app.get("/")
async def root():
    return {"service": "Team Service", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/teams", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    team: TeamCreate,
    user_id: int = Depends(verify_token),
    conn = Depends(get_db)
):
    # Create team
    new_team = await conn.fetchrow(
        """
        INSERT INTO teams (name, description, created_by, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, description, created_by, created_at
        """,
        team.name, team.description, user_id, datetime.utcnow()
    )
    
    team_dict = dict(new_team)
    
    # Add creator as a member
    await conn.execute(
        "INSERT INTO team_members (team_id, user_id, joined_at) VALUES ($1, $2, $3)",
        team_dict["id"], user_id, datetime.utcnow()
    )
    
    # Enrich with member info
    team_dict = await enrich_team_with_members(team_dict, conn)
    
    return team_dict

@app.get("/teams", response_model=List[TeamResponse])
async def get_teams(
    user_id: int = Depends(verify_token),
    conn = Depends(get_db)
):
    # Get all teams where user is a member
    teams = await conn.fetch(
        """
        SELECT DISTINCT t.id, t.name, t.description, t.created_by, t.created_at
        FROM teams t
        INNER JOIN team_members tm ON t.id = tm.team_id
        WHERE tm.user_id = $1
        ORDER BY t.created_at DESC
        """,
        user_id
    )
    
    result = []
    for team in teams:
        team_dict = dict(team)
        team_dict = await enrich_team_with_members(team_dict, conn)
        result.append(team_dict)
    
    return result

@app.get("/teams/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: int,
    user_id: int = Depends(verify_token),
    conn = Depends(get_db)
):
    # Check if user is a member
    is_member = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2)",
        team_id, user_id
    )
    
    if not is_member:
        raise HTTPException(status_code=403, detail="You are not a member of this team")
    
    team = await conn.fetchrow(
        "SELECT id, name, description, created_by, created_at FROM teams WHERE id = $1",
        team_id
    )
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    team_dict = dict(team)
    team_dict = await enrich_team_with_members(team_dict, conn)
    
    return team_dict

@app.put("/teams/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: int,
    team_update: TeamUpdate,
    user_id: int = Depends(verify_token),
    conn = Depends(get_db)
):
    # Check if user created the team
    team = await conn.fetchrow("SELECT * FROM teams WHERE id = $1", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the team creator can update the team")
    
    # Update team
    update_fields = []
    values = []
    param_count = 1
    
    if team_update.name is not None:
        update_fields.append(f"name = ${param_count}")
        values.append(team_update.name)
        param_count += 1
    
    if team_update.description is not None:
        update_fields.append(f"description = ${param_count}")
        values.append(team_update.description)
        param_count += 1
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    values.append(team_id)
    query = f"UPDATE teams SET {', '.join(update_fields)} WHERE id = ${param_count} RETURNING id, name, description, created_by, created_at"
    
    updated_team = await conn.fetchrow(query, *values)
    team_dict = dict(updated_team)
    team_dict = await enrich_team_with_members(team_dict, conn)
    
    return team_dict

@app.delete("/teams/{team_id}")
async def delete_team(
    team_id: int,
    user_id: int = Depends(verify_token),
    conn = Depends(get_db)
):
    # Check if user created the team
    team = await conn.fetchrow("SELECT * FROM teams WHERE id = $1", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the team creator can delete the team")
    
    # Delete team (cascade will handle members)
    await conn.execute("DELETE FROM teams WHERE id = $1", team_id)
    
    return {"message": "Team deleted successfully"}

@app.post("/teams/{team_id}/members")
async def add_member(
    team_id: int,
    member: MemberAdd,
    user_id: int = Depends(verify_token),
    conn = Depends(get_db)
):
    # Check if user created the team
    team = await conn.fetchrow("SELECT * FROM teams WHERE id = $1", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the team creator can add members")
    
    # Check if user exists
    user_info = await get_user_info(member.user_id)
    if not user_info:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already a member
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2)",
        team_id, member.user_id
    )
    
    if exists:
        raise HTTPException(status_code=400, detail="User is already a member")
    
    # Add member
    await conn.execute(
        "INSERT INTO team_members (team_id, user_id, joined_at) VALUES ($1, $2, $3)",
        team_id, member.user_id, datetime.utcnow()
    )
    
    return {"message": "Member added successfully"}

@app.delete("/teams/{team_id}/members/{member_id}")
async def remove_member(
    team_id: int,
    member_id: int,
    user_id: int = Depends(verify_token),
    conn = Depends(get_db)
):
    # Check if user created the team
    team = await conn.fetchrow("SELECT * FROM teams WHERE id = $1", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the team creator can remove members")
    
    # Can't remove the creator
    if member_id == team["created_by"]:
        raise HTTPException(status_code=400, detail="Cannot remove the team creator")
    
    # Remove member
    result = await conn.execute(
        "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id, member_id
    )
    
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Member not found in team")
    
    return {"message": "Member removed successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3002)
