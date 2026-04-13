"""
VoiceFlow Marketing AI - Workflow Schemas
==========================================
Request/response models for the Workflow automation endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Request Schemas ─────────────────────────────────────────────


class WorkflowCreate(BaseModel):
    """Create a new workflow."""

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    workflow_type: Optional[str] = Field(
        default=None,
        pattern="^(voice_to_lead|emotion_retarget|churn_prevention|lead_nurture|auto_response|crm_sync|campaign_trigger|notification|data_enrichment|custom)$",
    )
    n8n_workflow_id: Optional[str] = Field(default=None, max_length=100)
    flowise_flow_id: Optional[str] = Field(default=None, max_length=100)
    webhook_url: Optional[str] = Field(default=None, max_length=500)
    trigger_config: Optional[dict[str, Any]] = None
    action_config: Optional[dict[str, Any]] = None
    variables: Optional[dict[str, Any]] = None
    max_executions_per_hour: Optional[int] = Field(default=None, ge=1)
    cooldown_seconds: Optional[int] = Field(default=None, ge=0)
    tags: Optional[list[str]] = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowUpdate(BaseModel):
    """Update an existing workflow."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    workflow_type: Optional[str] = Field(
        default=None,
        pattern="^(voice_to_lead|emotion_retarget|churn_prevention|lead_nurture|auto_response|crm_sync|campaign_trigger|notification|data_enrichment|custom)$",
    )
    n8n_workflow_id: Optional[str] = Field(default=None, max_length=100)
    flowise_flow_id: Optional[str] = Field(default=None, max_length=100)
    webhook_url: Optional[str] = Field(default=None, max_length=500)
    trigger_config: Optional[dict[str, Any]] = None
    action_config: Optional[dict[str, Any]] = None
    variables: Optional[dict[str, Any]] = None
    max_executions_per_hour: Optional[int] = Field(default=None, ge=1)
    cooldown_seconds: Optional[int] = Field(default=None, ge=0)
    tags: Optional[list[str]] = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowTriggerRequest(BaseModel):
    """Trigger a workflow execution."""

    workflow_id: int
    trigger_type: Optional[str] = Field(default=None, max_length=50)
    trigger_data: Optional[dict[str, Any]] = None
    voice_analysis_id: Optional[int] = None
    lead_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ── Response Schemas ────────────────────────────────────────────


class WorkflowExecutionResponse(BaseModel):
    """Workflow execution detail."""

    id: int
    workflow_id: int
    voice_analysis_id: Optional[int] = None
    lead_id: Optional[int] = None
    trigger_type: Optional[str] = None
    trigger_data: Optional[dict[str, Any]] = None
    status: str
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    output_data: Optional[dict[str, Any]] = None
    actions_taken: Optional[list[dict[str, Any]]] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowDetail(BaseModel):
    """Workflow detail response."""

    id: int
    name: str
    description: Optional[str] = None
    workflow_type: Optional[str] = None
    n8n_workflow_id: Optional[str] = None
    flowise_flow_id: Optional[str] = None
    webhook_url: Optional[str] = None
    trigger_config: Optional[dict[str, Any]] = None
    action_config: Optional[dict[str, Any]] = None
    variables: Optional[dict[str, Any]] = None
    is_active: bool = False
    version: int = 1
    max_executions_per_hour: Optional[int] = None
    cooldown_seconds: Optional[int] = None
    total_executions: int = 0
    successful_executions: int = 0
    failed_executions: int = 0
    last_execution_at: Optional[datetime] = None
    avg_execution_time_ms: Optional[float] = None
    tags: Optional[list[str]] = None
    user_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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
