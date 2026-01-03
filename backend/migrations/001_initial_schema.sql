-- ChatFold Initial Database Schema
-- Version: 001
-- Date: 2025-01-03
-- Description: Creates the initial database schema for ChatFold MVP

-- Create database (run manually before applying this migration)
-- CREATE DATABASE IF NOT EXISTS chatfold CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE chatfold;

-- ==============================================================================
-- Users Table
-- MVP Note: Uses DEFAULT_USER_ID ("user_default") for all operations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    plan ENUM('free', 'pro') DEFAULT 'free',
    created_at BIGINT NOT NULL,
    INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Projects Table
-- MVP Note: Uses DEFAULT_PROJECT_ID ("project_default") for all operations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_projects_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Folders Table
-- Working directories containing input files and output structures
-- ==============================================================================
CREATE TABLE IF NOT EXISTS folders (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_expanded BOOLEAN DEFAULT TRUE,
    job_id VARCHAR(64),
    conversation_id VARCHAR(64),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_folders_project_id (project_id),
    INDEX idx_folders_conversation_id (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Assets Table
-- User uploaded files (FASTA, PDB, etc.)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(64) PRIMARY KEY,
    folder_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type ENUM('fasta', 'pdb', 'text') NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    size INT,
    uploaded_at BIGINT NOT NULL,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    INDEX idx_assets_folder_id (folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Conversations Table
-- Chat sessions associated with folders
-- ==============================================================================
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(64) PRIMARY KEY,
    folder_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
    INDEX idx_conversations_folder_id (folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Messages Table
-- Individual messages within conversations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    conversation_id VARCHAR(64) NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    INDEX idx_messages_conversation_id (conversation_id),
    INDEX idx_messages_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Jobs Table
-- Protein folding tasks
-- ==============================================================================
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    conversation_id VARCHAR(64),
    job_type ENUM('folding', 'relaxation') DEFAULT 'folding',
    status ENUM('queued', 'running', 'partial', 'complete', 'failed', 'canceled') DEFAULT 'queued',
    stage VARCHAR(32) DEFAULT 'QUEUED',
    sequence TEXT NOT NULL,
    file_path VARCHAR(512),
    created_at BIGINT NOT NULL,
    completed_at BIGINT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    INDEX idx_jobs_user_id (user_id),
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Structures Table
-- Generated PDB structures from jobs
-- ==============================================================================
CREATE TABLE IF NOT EXISTS structures (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    label VARCHAR(64) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    plddt_score INT,
    is_final BOOLEAN DEFAULT FALSE,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_structures_job_id (job_id),
    INDEX idx_structures_user_project (user_id, project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Job Events Table
-- Persisted SSE events for NanoCC job execution (for learning/debugging)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS job_events (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    event_type ENUM('PROLOGUE', 'ANNOTATION', 'THINKING_TEXT', 'THINKING_PDB', 'CONCLUSION') NOT NULL,
    stage VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    progress INT NOT NULL DEFAULT 0,
    message TEXT,
    block_index INT,
    structure_id VARCHAR(64),
    created_at BIGINT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (structure_id) REFERENCES structures(id) ON DELETE SET NULL,
    INDEX idx_job_events_job_id (job_id),
    INDEX idx_job_events_created_at (created_at),
    INDEX idx_job_events_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Learning Records Table
-- Curated learning data from completed jobs (for ML training)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS learning_records (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL UNIQUE,
    input_sequence TEXT NOT NULL,
    input_constraints TEXT,
    thinking_block_count INT DEFAULT 0,
    structure_count INT DEFAULT 0,
    final_structure_id VARCHAR(64),
    final_plddt INT,
    user_selected_structure_id VARCHAR(64),
    user_rating INT,
    user_feedback TEXT,
    created_at BIGINT NOT NULL,
    exported_at BIGINT,
    export_batch_id VARCHAR(64),
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (final_structure_id) REFERENCES structures(id) ON DELETE SET NULL,
    FOREIGN KEY (user_selected_structure_id) REFERENCES structures(id) ON DELETE SET NULL,
    INDEX idx_learning_records_job_id (job_id),
    INDEX idx_learning_records_created_at (created_at),
    INDEX idx_learning_records_exported_at (exported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Seed Data: Default User and Project (MVP)
-- ==============================================================================
INSERT INTO users (id, name, email, plan, created_at)
VALUES ('user_default', 'Default User', 'user@chatfold.ai', 'free', UNIX_TIMESTAMP() * 1000)
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO projects (id, user_id, name, description, created_at, updated_at)
VALUES (
    'project_default',
    'user_default',
    'Default Project',
    'Default project for MVP - all folding jobs are organized here',
    UNIX_TIMESTAMP() * 1000,
    UNIX_TIMESTAMP() * 1000
)
ON DUPLICATE KEY UPDATE name = name;
