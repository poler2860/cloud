# Nefos - Jira-like Project Management System

A microservices-based project management system similar to Jira, built with Node.js, React, and PostgreSQL.

## Features

### User Management
- User registration (requires admin approval)
- Login/Authentication with JWT
- View account details
- Admin panel for user management
- Role-based access control (User/Admin)

### Team Management
- Admins can create, modify, and delete teams
- Team leaders can manage team details
- Add/remove team members
- View team information

### Task Management
- Team leaders can create, modify, and delete tasks
- Task status management (Todo, In Progress, In Review, Done)
- Task priority levels (Low, Medium, High, Critical)
- Assign tasks to team members
- Add comments to tasks
- View task details and history

### Frontend Pages
- Login/Register page
- Dashboard with statistics
- Teams page
- My Tasks page
- Task Detail page
- Admin Panel

## Architecture

The system consists of:
- **PostgreSQL Database**: Stores all application data
- **User Service** (Port 3001): Handles authentication and user management
- **Team Service** (Port 3002): Manages teams and memberships
- **Task Service** (Port 3003): Handles tasks and comments
- **Frontend** (React): User interface
- **Nginx**: Reverse proxy and static file serving
- **pgweb** (Port 8081): Modern web-based PostgreSQL database manager

## Prerequisites

- Docker and Docker Compose
- At least 2GB of free RAM

## Getting Started

1. **Clone the repository**
   ```bash
   cd /home/polychronis/Projects/TUC/nefos
   ```

2. **Start the application**
   ```bash
   docker-compose up -d
   ```

   This will start all services:
   - PostgreSQL on port 5432
   - User Service on port 3001
   - Team Service on port 3002
   - Task Service on port 3003
   - Nginx on port 80
   - pgweb on port 8081

3. **Access the application**
   
   - **Main App**: `http://localhost`
   - **Database Manager (pgweb)**: `http://localhost:8081`

4. **Default Admin Account**
   - Email: `admin@nefos.com`
   - Password: `admin123`
   
   **Important**: Change this password immediately in production!

5. **Database Management**
   
   Access the pgweb database manager at `http://localhost:8081` to:
   - Browse database tables and data
   - Run SQL queries with syntax highlighting
   - View database structure and relationships
   - Export data in various formats
   - Monitor query performance
   
   The connection is automatically configured - just open the URL!

## Development

### Building individual services

```bash
# Build user service
docker-compose build user-service

# Build team service
docker-compose build team-service

# Build task service
docker-compose build task-service

# Build frontend
docker-compose build frontend
```

### Viewing logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f user-service
docker-compose logs -f team-service
docker-compose logs -f task-service
docker-compose logs -f frontend
```

### Stopping the application

```bash
docker-compose down
```

### Stopping and removing volumes (clean slate)

```bash
docker-compose down -v
```

## API Documentation

### User Service (Port 3001)

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

#### User Management
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID
- `PATCH /api/users/:id/status` - Update user status (admin only)
- `PATCH /api/users/:id/role` - Update user role (admin only)
- `PATCH /api/users/:id` - Update user profile
- `DELETE /api/users/:id` - Delete user (admin only)

### Team Service (Port 3002)

- `GET /api/teams` - Get all teams
- `GET /api/teams/:id` - Get team by ID
- `POST /api/teams` - Create team (admin only)
- `PUT /api/teams/:id` - Update team (admin or leader)
- `DELETE /api/teams/:id` - Delete team (admin only)
- `POST /api/teams/:id/members` - Add team member
- `DELETE /api/teams/:id/members/:userId` - Remove team member

### Task Service (Port 3003)

- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/my-tasks` - Get tasks assigned to current user
- `GET /api/tasks/:id` - Get task by ID
- `POST /api/tasks` - Create task (team leader only)
- `PUT /api/tasks/:id` - Update task (team leader only)
- `DELETE /api/tasks/:id` - Delete task (team leader only)
- `POST /api/tasks/:id/comments` - Add comment
- `GET /api/tasks/:id/comments` - Get task comments

## Database Schema

### Users
- id, email, password_hash, first_name, last_name
- role (user/admin), status (pending/active/inactive)
- created_at, updated_at

### Teams
- id, name, description, leader_id
- created_at, updated_at

### Team Members
- id, team_id, user_id, joined_at

### Tasks
- id, title, description, team_id
- assignee_id, reporter_id
- status (todo/in_progress/in_review/done)
- priority (low/medium/high/critical)
- due_date, created_at, updated_at

### Comments
- id, task_id, user_id, content
- created_at, updated_at

## Security Notes

1. **Change default admin password** immediately
2. **Update JWT_SECRET** in docker-compose.yml for production
3. **Use HTTPS** in production with proper SSL certificates
4. **Set up proper environment variables** for production
5. **Enable PostgreSQL authentication** for production

## Troubleshooting

### Services not starting
```bash
docker-compose logs
```

### Database connection issues
```bash
docker-compose logs postgres
```

### Rebuild everything
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## License

MIT License
