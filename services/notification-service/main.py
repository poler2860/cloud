from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict
from jose import JWTError, jwt
import asyncpg
import asyncio
import os
import json
from aiokafka import AIOKafkaConsumer
from datetime import datetime

app = FastAPI(title="Notification Service", version="1.0.0")

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
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/nefos")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

db_pool: Optional[asyncpg.Pool] = None
active_connections: Dict[int, List[WebSocket]] = {}

# Database
@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=5, max_size=20)
    
    # Start Kafka consumer
    asyncio.create_task(consume_notifications())

@app.on_event("shutdown")
async def shutdown():
    if db_pool:
        await db_pool.close()

async def get_db():
    async with db_pool.acquire() as conn:
        yield conn

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        user_id: int = int(user_id_str)
        return user_id
    except (JWTError, ValueError, TypeError):
        return None

# Kafka Consumer
async def consume_notifications():
    await asyncio.sleep(10)  # Wait for Kafka to be ready
    
    consumer = AIOKafkaConsumer(
        'task-notifications',
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        group_id='notification-service'
    )
    
    await consumer.start()
    try:
        async for msg in consumer:
            notification = msg.value
            print(f"Received notification: {notification}")
            
            # Store in database
            async with db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO notifications (user_id, type, title, message, task_id, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    notification['user_id'],
                    notification['type'],
                    notification['title'],
                    notification['message'],
                    notification.get('task_id'),
                    datetime.utcnow()
                )
            
            # Send to connected WebSocket clients
            await broadcast_to_user(notification['user_id'], notification)
    finally:
        await consumer.stop()

async def broadcast_to_user(user_id: int, notification: dict):
    if user_id in active_connections:
        disconnected = []
        for websocket in active_connections[user_id]:
            try:
                await websocket.send_json(notification)
            except:
                disconnected.append(websocket)
        
        # Remove disconnected clients
        for ws in disconnected:
            active_connections[user_id].remove(ws)

# Routes
@app.get("/")
async def root():
    return {"service": "Notification Service", "version": "1.0.0", "status": "running"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    if not token:
        await websocket.close(code=1008, reason="Token required")
        return
    
    user_id = verify_token(token)
    if not user_id:
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    await websocket.accept()
    
    # Add to active connections
    if user_id not in active_connections:
        active_connections[user_id] = []
    active_connections[user_id].append(websocket)
    
    try:
        # Send unread notifications on connect
        async with db_pool.acquire() as conn:
            notifications = await conn.fetch(
                """
                SELECT id, type, title, message, task_id, created_at, read
                FROM notifications
                WHERE user_id = $1 AND read = false
                ORDER BY created_at DESC
                LIMIT 20
                """,
                user_id
            )
            
            for notif in notifications:
                await websocket.send_json({
                    'id': notif['id'],
                    'type': notif['type'],
                    'title': notif['title'],
                    'message': notif['message'],
                    'task_id': notif['task_id'],
                    'created_at': notif['created_at'].isoformat(),
                    'read': notif['read']
                })
        
        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            # Handle mark as read
            if data.startswith('read:'):
                notif_id = int(data.split(':')[1])
                async with db_pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2",
                        notif_id, user_id
                    )
    
    except WebSocketDisconnect:
        active_connections[user_id].remove(websocket)
        if not active_connections[user_id]:
            del active_connections[user_id]

@app.get("/api/notifications")
async def get_notifications(
    token: str,
    limit: int = 50,
    conn: asyncpg.Connection = Depends(get_db)
):
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    notifications = await conn.fetch(
        """
        SELECT id, type, title, message, task_id, created_at, read
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        user_id, limit
    )
    
    return [dict(n) for n in notifications]

@app.post("/api/notifications/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    token: str,
    conn: asyncpg.Connection = Depends(get_db)
):
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    await conn.execute(
        "UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2",
        notification_id, user_id
    )
    
    return {"success": True}

@app.get("/api/notifications/unread-count")
async def get_unread_count(
    token: str,
    conn: asyncpg.Connection = Depends(get_db)
):
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false",
        user_id
    )
    
    return {"count": count}
