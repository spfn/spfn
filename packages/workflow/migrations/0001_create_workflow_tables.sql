-- Migration: Create Workflow Tables
-- Description: Creates workflow_executions and workflow_step_executions tables

-- Workflow Executions Table
CREATE TABLE IF NOT EXISTS workflow_executions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input JSONB,
    current_step INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by workflow name and status
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_name
    ON workflow_executions(workflow_name);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
    ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_status
    ON workflow_executions(workflow_name, status);

-- Workflow Step Executions Table
CREATE TABLE IF NOT EXISTS workflow_step_executions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    step_name TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    output JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying steps by execution
CREATE INDEX IF NOT EXISTS idx_workflow_step_executions_execution_id
    ON workflow_step_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_executions_execution_step
    ON workflow_step_executions(execution_id, step_index);

-- Updated at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_workflow_executions_updated_at ON workflow_executions;
CREATE TRIGGER update_workflow_executions_updated_at
    BEFORE UPDATE ON workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_step_executions_updated_at ON workflow_step_executions;
CREATE TRIGGER update_workflow_step_executions_updated_at
    BEFORE UPDATE ON workflow_step_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
