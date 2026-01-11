-- Database initialization script for Nefos (Jira-like application)

-- Create enum types
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE user_status AS ENUM ('pending', 'active', 'inactive');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'in_review', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role DEFAULT 'user',
    status user_status DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    leader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team members junction table
CREATE TABLE team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, user_id)
);

-- Tasks table
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status task_status DEFAULT 'todo',
    priority task_priority DEFAULT 'medium',
    due_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comments table
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_teams_leader ON teams(leader_id);
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_tasks_team ON tasks(team_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_comments_task ON comments(task_id);

-- Create unique constraint to ensure a user can only lead one team
CREATE UNIQUE INDEX idx_unique_team_leader ON teams(leader_id);

-- Create function to check if a user is a team leader before adding as member
CREATE OR REPLACE FUNCTION check_member_not_leader()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the user being added is a team leader of a DIFFERENT team
    IF EXISTS (SELECT 1 FROM teams WHERE leader_id = NEW.user_id AND id != NEW.team_id) THEN
        RAISE EXCEPTION 'User is already a team leader and cannot be a member of other teams';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce the constraint
CREATE TRIGGER prevent_leader_as_member
    BEFORE INSERT ON team_members
    FOR EACH ROW
    EXECUTE FUNCTION check_member_not_leader();

-- Create function to check if a user is a member of other teams before becoming a leader
CREATE OR REPLACE FUNCTION check_leader_not_member()
RETURNS TRIGGER AS $$
BEGIN
    -- When creating a new team, check if leader is a member of other teams
    IF (TG_OP = 'INSERT') THEN
        IF EXISTS (SELECT 1 FROM team_members WHERE user_id = NEW.leader_id) THEN
            RAISE EXCEPTION 'User is a member of other teams and cannot become a team leader';
        END IF;
    END IF;
    
    -- When updating a team leader, check if new leader is a member of other teams
    IF (TG_OP = 'UPDATE' AND OLD.leader_id IS DISTINCT FROM NEW.leader_id) THEN
        IF EXISTS (SELECT 1 FROM team_members WHERE user_id = NEW.leader_id AND team_id != NEW.id) THEN
            RAISE EXCEPTION 'User is a member of other teams and cannot become a team leader';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce the constraint
CREATE TRIGGER prevent_member_as_leader
    BEFORE INSERT OR UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION check_leader_not_member();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updating updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123)
-- Note: In production, this should be changed immediately
INSERT INTO users (email, password_hash, first_name, last_name, role, status)
VALUES ('admin@nefos.com', '$2b$10$cyTKOTL.nreIgcPfX.R4..iBWFJCBxiDN2JzbJs4Pdy7EM5aL7YT6', 'Admin', 'User', 'admin', 'active');

-- Insert sample users for testing (password for all: admin123)
INSERT INTO users (email, password_hash, first_name, last_name, role, status)
VALUES 
    ('john.doe@nefos.com', '$2b$10$cyTKOTL.nreIgcPfX.R4..iBWFJCBxiDN2JzbJs4Pdy7EM5aL7YT6', 'John', 'Doe', 'user', 'active'),
    ('jane.smith@nefos.com', '$2b$10$cyTKOTL.nreIgcPfX.R4..iBWFJCBxiDN2JzbJs4Pdy7EM5aL7YT6', 'Jane', 'Smith', 'user', 'active');
