"""
VoiceFlow Marketing AI - Workflow Schemas
==========================================
Request/response models for the Workflow automation endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ── Request Schemas ─────────────────────────────────────────────


class WorkflowCreate(BaseModel):
    """Create a new workflow."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    workflow_type: str | None = Field(
        default=None,
        pattern="^(voice_to_lead|emotion_retarget|churn_prevention|lead_nurture|auto_response|crm_sync|campaign_trigger|notification|data_enrichment|custom)$",
    )
    n8n_workflow_id: str | None = Field(default=None, max_length=100)
    flowise_flow_id: str | None = Field(default=None, max_length=100)
    webhook_url: str | None = Field(default=None, max_length=500)
    trigger_config: dict[str, Any] | None = None
    action_config: dict[str, Any] | None = None
    variables: dict[str, Any] | None = None
    max_executions_per_hour: int | None = Field(default=None, ge=1)
    cooldown_seconds: int | None = Field(default=None, ge=0)
    tags: list[str] | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowUpdate(BaseModel):
    """Update an existing workflow."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    workflow_type: str | None = Field(
        default=None,
        pattern="^(voice_to_lead|emotion_retarget|churn_prevention|lead_nurture|auto_response|crm_sync|campaign_trigger|notification|data_enrichment|custom)$",
    )
    n8n_workflow_id: str | None = Field(default=None, max_length=100)
    flowise_flow_id: str | None = Field(default=None, max_length=100)
    webhook_url: str | None = Field(default=None, max_length=500)
    trigger_config: dict[str, Any] | None = None
    action_config: dict[str, Any] | None = None
    variables: dict[str, Any] | None = None
    max_executions_per_hour: int | None = Field(default=None, ge=1)
    cooldown_seconds: int | None = Field(default=None, ge=0)
    tags: list[str] | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowTriggerRequest(BaseModel):
    """Trigger a workflow execution."""

    workflow_id: int
    trigger_type: str | None = Field(default=None, max_length=50)
    trigger_data: dict[str, Any] | None = None
    voice_analysis_id: int | None = None
    lead_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Response Schemas ────────────────────────────────────────────


class WorkflowExecutionResponse(BaseModel):
    """Workflow execution detail."""

    id: int
    workflow_id: int
    voice_analysis_id: int | None = None
    lead_id: int | None = None
    trigger_type: str | None = None
    trigger_data: dict[str, Any] | None = None
    status: str
    error_message: str | None = None
    error_code: str | None = None
    retry_count: int = 0
    max_retries: int = 3
    output_data: dict[str, Any] | None = None
    actions_taken: list[dict[str, Any]] | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: float | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowDetail(BaseModel):
    """Workflow detail response."""

    id: int
    name: str
    description: str | None = None
    workflow_type: str | None = None
    n8n_workflow_id: str | None = None
    flowise_flow_id: str | None = None
    webhook_url: str | None = None
    trigger_config: dict[str, Any] | None = None
    action_config: dict[str, Any] | None = None
    variables: dict[str, Any] | None = None
    is_active: bool = False
    version: int = 1
    max_executions_per_hour: int | None = None
    cooldown_seconds: int | None = None
    total_executions: int = 0
    successful_executions: int = 0
    failed_executions: int = 0
    last_execution_at: datetime | None = None
    avg_execution_time_ms: float | None = None
    tags: list[str] | None = None
    user_id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowTemplateResponse(BaseModel):
    """Workflow template for quick creation."""

    name: str
    description: str
    workflow_type: str
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    action_config: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
