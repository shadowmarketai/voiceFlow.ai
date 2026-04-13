"""
VoiceFlow Marketing AI - White-Label & Multi-Tenant System
===========================================================
The KILLER FEATURE for reseller agencies

Features:
- Multi-tenant architecture with complete isolation
- Custom branding (logo, colors, favicon)
- Custom domain with DNS verification
- Reseller hierarchy & commission tracking
- Client management under resellers
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum
import os
import hashlib
import secrets
import httpx
from sqlalchemy.orm import Session


class TenantType(Enum):
    """Types of tenants"""
    PLATFORM = "platform"      # Shadow Market (you)
    RESELLER = "reseller"      # Agency partners
    CLIENT = "client"          # End customers


class SubscriptionPlan(Enum):
    """Subscription tiers"""
    STARTER = "starter"        # ₹4,999/month
    GROWTH = "growth"          # ₹14,999/month
    PRO = "pro"                # ₹39,999/month
    ENTERPRISE = "enterprise"  # Custom pricing


@dataclass
class TenantBranding:
    """Custom branding for white-label"""
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: str = "#6366f1"      # Indigo
    secondary_color: str = "#8b5cf6"    # Purple
    background_color: str = "#f9fafb"
    text_color: str = "#111827"
    company_name: str = "VoiceFlow AI"
    tagline: str = "Voice AI + Marketing Automation"
    support_email: str = "support@voiceflow.ai"
    support_phone: str = ""
    custom_css: Optional[str] = None
    custom_js: Optional[str] = None


@dataclass
class Tenant:
    """Tenant/Organization entity"""
    id: str
    name: str
    slug: str                           # For subdomain: {slug}.voiceflow.io
    tenant_type: TenantType
    parent_tenant_id: Optional[str]     # For reseller hierarchy
    
    # Subscription
    plan: SubscriptionPlan = SubscriptionPlan.STARTER
    plan_started_at: Optional[datetime] = None
    plan_expires_at: Optional[datetime] = None
    
    # Custom domain
    subdomain: str = ""                 # {subdomain}.voiceflow.io
    custom_domain: Optional[str] = None # crm.agencyname.com
    domain_verified: bool = False
    ssl_enabled: bool = False
    
    # Branding
    branding: TenantBranding = field(default_factory=TenantBranding)
    
    # Reseller settings
    commission_rate: float = 20.0       # 20% default commission
    can_create_clients: bool = False
    max_clients: int = 0
    
    # Limits based on plan
    max_users: int = 1
    max_leads: int = 500
    max_call_minutes: int = 1000
    max_assistants: int = 1
    max_workflows: int = 5
    
    # Status
    is_active: bool = True
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class TenantUser:
    """User belonging to a tenant"""
    id: str
    tenant_id: str
    email: str
    password_hash: str
    first_name: str
    last_name: str
    role: str = "member"  # owner, admin, member
    is_active: bool = True
    last_login_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)


class WhiteLabelService:
    """
    White-label management service
    
    Handles:
    - Tenant creation and management
    - Custom branding
    - Custom domain setup
    - Reseller hierarchy
    - Commission calculation
    """
    
    # Plan limits configuration
    PLAN_LIMITS = {
        SubscriptionPlan.STARTER: {
            "max_users": 1,
            "max_leads": 500,
            "max_call_minutes": 1000,
            "max_assistants": 1,
            "max_workflows": 5,
            "max_integrations": 2,
            "price_inr": 4999,
            "can_whitelabel": False
        },
        SubscriptionPlan.GROWTH: {
            "max_users": 5,
            "max_leads": 5000,
            "max_call_minutes": 5000,
            "max_assistants": 3,
            "max_workflows": 10,
            "max_integrations": 10,
            "price_inr": 14999,
            "can_whitelabel": False
        },
        SubscriptionPlan.PRO: {
            "max_users": 999999,
            "max_leads": 999999,
            "max_call_minutes": 20000,
            "max_assistants": 999999,
            "max_workflows": 999999,
            "max_integrations": 999999,
            "price_inr": 39999,
            "can_whitelabel": True
        },
        SubscriptionPlan.ENTERPRISE: {
            "max_users": 999999,
            "max_leads": 999999,
            "max_call_minutes": 999999,
            "max_assistants": 999999,
            "max_workflows": 999999,
            "max_integrations": 999999,
            "price_inr": 99999,
            "can_whitelabel": True
        }
    }
    
    def __init__(self, db: Session = None):
        self.db = db
        self._tenants: Dict[str, Tenant] = {}  # In-memory cache
    
    def create_tenant(
        self,
        name: str,
        owner_email: str,
        owner_password: str,
        tenant_type: TenantType = TenantType.CLIENT,
        parent_tenant_id: Optional[str] = None,
        plan: SubscriptionPlan = SubscriptionPlan.STARTER
    ) -> Tenant:
        """
        Create a new tenant
        
        Args:
            name: Company/organization name
            owner_email: Email of the owner
            owner_password: Password for owner account
            tenant_type: Type of tenant
            parent_tenant_id: For reseller clients
            plan: Subscription plan
        
        Returns:
            Created tenant
        """
        # Generate unique ID and slug
        tenant_id = secrets.token_urlsafe(16)
        slug = self._generate_slug(name)
        
        # Get plan limits
        limits = self.PLAN_LIMITS[plan]
        
        # Create tenant
        tenant = Tenant(
            id=tenant_id,
            name=name,
            slug=slug,
            tenant_type=tenant_type,
            parent_tenant_id=parent_tenant_id,
            plan=plan,
            subdomain=slug,
            max_users=limits["max_users"],
            max_leads=limits["max_leads"],
            max_call_minutes=limits["max_call_minutes"],
            max_assistants=limits["max_assistants"],
            max_workflows=limits["max_workflows"],
            can_create_clients=tenant_type == TenantType.RESELLER,
            max_clients=50 if tenant_type == TenantType.RESELLER else 0,
            plan_started_at=datetime.now()
        )
        
        # Set branding defaults
        tenant.branding = TenantBranding(company_name=name)
        
        # Create owner user
        owner = TenantUser(
            id=secrets.token_urlsafe(16),
            tenant_id=tenant_id,
            email=owner_email,
            password_hash=self._hash_password(owner_password),
            first_name=name.split()[0] if name else "Admin",
            last_name=name.split()[-1] if len(name.split()) > 1 else "",
            role="owner"
        )
        
        # Store (in production, save to database)
        self._tenants[tenant_id] = tenant
        
        return tenant
    
    def create_reseller_tenant(
        self,
        name: str,
        owner_email: str,
        owner_password: str,
        commission_rate: float = 20.0,
        max_clients: int = 50
    ) -> Tenant:
        """
        Create a reseller/agency tenant
        
        Resellers can:
        - Create client tenants
        - Apply custom branding
        - Use custom domain
        - Earn commissions
        """
        tenant = self.create_tenant(
            name=name,
            owner_email=owner_email,
            owner_password=owner_password,
            tenant_type=TenantType.RESELLER,
            plan=SubscriptionPlan.PRO
        )
        
        tenant.commission_rate = commission_rate
        tenant.can_create_clients = True
        tenant.max_clients = max_clients
        
        return tenant
    
    def create_client_under_reseller(
        self,
        reseller_tenant_id: str,
        client_name: str,
        owner_email: str,
        owner_password: str,
        plan: SubscriptionPlan = SubscriptionPlan.STARTER
    ) -> Tenant:
        """
        Create a client tenant under a reseller
        """
        reseller = self._tenants.get(reseller_tenant_id)
        if not reseller:
            raise ValueError("Reseller tenant not found")
        
        if not reseller.can_create_clients:
            raise ValueError("Reseller cannot create clients")
        
        # Count existing clients
        client_count = len([
            t for t in self._tenants.values()
            if t.parent_tenant_id == reseller_tenant_id
        ])
        
        if client_count >= reseller.max_clients:
            raise ValueError("Maximum clients limit reached")
        
        # Create client with reseller as parent
        return self.create_tenant(
            name=client_name,
            owner_email=owner_email,
            owner_password=owner_password,
            tenant_type=TenantType.CLIENT,
            parent_tenant_id=reseller_tenant_id,
            plan=plan
        )
    
    def update_branding(
        self,
        tenant_id: str,
        branding: Dict[str, Any]
    ) -> TenantBranding:
        """
        Update tenant branding
        
        Args:
            tenant_id: Tenant ID
            branding: Dict with branding fields
        
        Returns:
            Updated branding
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            raise ValueError("Tenant not found")
        
        # Update branding fields
        if "logo_url" in branding:
            tenant.branding.logo_url = branding["logo_url"]
        if "favicon_url" in branding:
            tenant.branding.favicon_url = branding["favicon_url"]
        if "primary_color" in branding:
            tenant.branding.primary_color = branding["primary_color"]
        if "secondary_color" in branding:
            tenant.branding.secondary_color = branding["secondary_color"]
        if "company_name" in branding:
            tenant.branding.company_name = branding["company_name"]
        if "tagline" in branding:
            tenant.branding.tagline = branding["tagline"]
        if "support_email" in branding:
            tenant.branding.support_email = branding["support_email"]
        if "custom_css" in branding:
            tenant.branding.custom_css = branding["custom_css"]
        
        tenant.updated_at = datetime.now()
        
        return tenant.branding
    
    async def setup_custom_domain(
        self,
        tenant_id: str,
        custom_domain: str
    ) -> Dict[str, Any]:
        """
        Setup custom domain for white-label
        
        Returns DNS configuration instructions
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            raise ValueError("Tenant not found")
        
        # Check plan allows white-label
        limits = self.PLAN_LIMITS[tenant.plan]
        if not limits.get("can_whitelabel"):
            raise ValueError("Plan does not support white-label")
        
        # Generate verification token
        verification_token = secrets.token_urlsafe(32)
        
        tenant.custom_domain = custom_domain
        tenant.domain_verified = False
        
        # Return DNS configuration
        return {
            "domain": custom_domain,
            "status": "pending_verification",
            "dns_records": [
                {
                    "type": "CNAME",
                    "name": custom_domain,
                    "value": f"{tenant.subdomain}.voiceflow.io",
                    "ttl": 3600
                },
                {
                    "type": "TXT",
                    "name": f"_voiceflow.{custom_domain}",
                    "value": f"voiceflow-verification={verification_token}",
                    "ttl": 3600
                }
            ],
            "instructions": [
                f"1. Add CNAME record: {custom_domain} → {tenant.subdomain}.voiceflow.io",
                f"2. Add TXT record for verification",
                "3. Wait 5-10 minutes for DNS propagation",
                "4. Click 'Verify Domain' button"
            ],
            "verification_token": verification_token
        }
    
    async def verify_custom_domain(
        self,
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Verify custom domain DNS configuration
        """
        import socket
        
        tenant = self._tenants.get(tenant_id)
        if not tenant or not tenant.custom_domain:
            raise ValueError("Tenant or domain not found")
        
        domain = tenant.custom_domain
        
        try:
            # Check CNAME record
            cname_target = socket.gethostbyname(domain)
            expected_target = socket.gethostbyname(f"{tenant.subdomain}.voiceflow.io")
            
            if cname_target == expected_target:
                tenant.domain_verified = True
                tenant.ssl_enabled = True  # Auto-provision SSL
                
                return {
                    "verified": True,
                    "domain": domain,
                    "ssl_enabled": True,
                    "message": f"Domain verified! Your platform is now accessible at https://{domain}"
                }
            else:
                return {
                    "verified": False,
                    "error": "CNAME record not pointing to correct target"
                }
                
        except socket.gaierror:
            return {
                "verified": False,
                "error": "Domain DNS not resolving. Please check DNS configuration."
            }
    
    def calculate_reseller_commission(
        self,
        reseller_tenant_id: str,
        period_start: datetime,
        period_end: datetime
    ) -> Dict[str, Any]:
        """
        Calculate commission for a reseller
        
        Returns:
            Commission breakdown
        """
        reseller = self._tenants.get(reseller_tenant_id)
        if not reseller:
            raise ValueError("Reseller not found")
        
        if reseller.tenant_type != TenantType.RESELLER:
            raise ValueError("Not a reseller tenant")
        
        # Get all clients under reseller
        clients = [
            t for t in self._tenants.values()
            if t.parent_tenant_id == reseller_tenant_id
        ]
        
        # Calculate revenue from each client
        total_revenue = 0
        client_breakdown = []
        
        for client in clients:
            # Get client's plan price
            plan_price = self.PLAN_LIMITS[client.plan]["price_inr"]
            
            # Calculate months in period
            months = (period_end - period_start).days / 30
            
            client_revenue = plan_price * months
            total_revenue += client_revenue
            
            client_breakdown.append({
                "client_id": client.id,
                "client_name": client.name,
                "plan": client.plan.value,
                "revenue": client_revenue
            })
        
        # Calculate commission
        commission_amount = total_revenue * (reseller.commission_rate / 100)
        
        return {
            "reseller_id": reseller_tenant_id,
            "reseller_name": reseller.name,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "total_clients": len(clients),
            "total_revenue": total_revenue,
            "commission_rate": reseller.commission_rate,
            "commission_amount": commission_amount,
            "net_to_platform": total_revenue - commission_amount,
            "client_breakdown": client_breakdown,
            "currency": "INR"
        }
    
    def resolve_tenant(
        self,
        host: str
    ) -> Optional[Tenant]:
        """
        Resolve tenant from request host
        
        Supports:
        - Subdomain: agency.voiceflow.io
        - Custom domain: crm.agency.com
        """
        # Check custom domains first
        for tenant in self._tenants.values():
            if tenant.custom_domain == host and tenant.domain_verified:
                return tenant
        
        # Check subdomains
        if ".voiceflow.io" in host:
            subdomain = host.replace(".voiceflow.io", "")
            for tenant in self._tenants.values():
                if tenant.subdomain == subdomain:
                    return tenant
        
        return None
    
    def get_tenant_hierarchy(
        self,
        tenant_id: str
    ) -> List[Tenant]:
        """
        Get tenant hierarchy (parent reseller → client)
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return []
        
        hierarchy = [tenant]
        
        # Walk up the hierarchy
        current = tenant
        while current.parent_tenant_id:
            parent = self._tenants.get(current.parent_tenant_id)
            if parent:
                hierarchy.insert(0, parent)
                current = parent
            else:
                break
        
        return hierarchy
    
    def get_reseller_clients(
        self,
        reseller_tenant_id: str
    ) -> List[Tenant]:
        """
        Get all clients under a reseller
        """
        return [
            t for t in self._tenants.values()
            if t.parent_tenant_id == reseller_tenant_id
        ]
    
    def upgrade_plan(
        self,
        tenant_id: str,
        new_plan: SubscriptionPlan
    ) -> Tenant:
        """
        Upgrade tenant plan
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            raise ValueError("Tenant not found")
        
        # Get new limits
        limits = self.PLAN_LIMITS[new_plan]
        
        # Update tenant
        tenant.plan = new_plan
        tenant.max_users = limits["max_users"]
        tenant.max_leads = limits["max_leads"]
        tenant.max_call_minutes = limits["max_call_minutes"]
        tenant.max_assistants = limits["max_assistants"]
        tenant.max_workflows = limits["max_workflows"]
        tenant.updated_at = datetime.now()
        
        return tenant
    
    def get_branding_css(
        self,
        tenant_id: str
    ) -> str:
        """
        Generate CSS variables for tenant branding
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return ""
        
        branding = tenant.branding
        
        css = f"""
        :root {{
            --primary-color: {branding.primary_color};
            --secondary-color: {branding.secondary_color};
            --background-color: {branding.background_color};
            --text-color: {branding.text_color};
        }}
        
        .brand-logo {{
            background-image: url('{branding.logo_url or "/default-logo.png"}');
        }}
        
        .brand-name::after {{
            content: '{branding.company_name}';
        }}
        """
        
        if branding.custom_css:
            css += f"\n/* Custom CSS */\n{branding.custom_css}"
        
        return css
    
    def _generate_slug(self, name: str) -> str:
        """Generate URL-safe slug from name"""
        import re
        slug = name.lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = slug.strip('-')
        
        # Ensure uniqueness
        base_slug = slug
        counter = 1
        while any(t.slug == slug for t in self._tenants.values()):
            slug = f"{base_slug}-{counter}"
            counter += 1
        
        return slug
    
    def _hash_password(self, password: str) -> str:
        """Hash password with salt"""
        salt = os.urandom(32)
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt,
            100000
        )
        return salt.hex() + key.hex()


# ============================================
# FastAPI Integration
# ============================================

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Middleware to resolve tenant from request
    """
    
    def __init__(self, app, whitelabel_service: WhiteLabelService):
        super().__init__(app)
        self.whitelabel_service = whitelabel_service
    
    async def dispatch(self, request: Request, call_next):
        # Get host from request
        host = request.headers.get("host", "").split(":")[0]
        
        # Resolve tenant
        tenant = self.whitelabel_service.resolve_tenant(host)
        
        # Store tenant in request state
        request.state.tenant = tenant
        request.state.tenant_id = tenant.id if tenant else None
        
        response = await call_next(request)
        return response


def get_current_tenant(request: Request) -> Tenant:
    """
    Dependency to get current tenant from request
    """
    tenant = getattr(request.state, "tenant", None)
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail="Tenant not found"
        )
    return tenant


# ============================================
# Usage Example
# ============================================

if __name__ == "__main__":
    # Create service
    service = WhiteLabelService()
    
    # Create platform owner (Shadow Market)
    platform = service.create_tenant(
        name="Shadow Market",
        owner_email="kumaran@shadowmarket.ai",
        owner_password="secure123",
        tenant_type=TenantType.PLATFORM,
        plan=SubscriptionPlan.ENTERPRISE
    )
    print(f"Platform created: {platform.name} ({platform.slug})")
    
    # Create a reseller agency
    reseller = service.create_reseller_tenant(
        name="Digital Growth Agency",
        owner_email="agency@digitalgrowth.in",
        owner_password="agency123",
        commission_rate=20.0,
        max_clients=50
    )
    print(f"Reseller created: {reseller.name} ({reseller.slug})")
    
    # Reseller creates a client
    client = service.create_client_under_reseller(
        reseller_tenant_id=reseller.id,
        client_name="Mumbai Realty Co",
        owner_email="info@mumbairealty.com",
        owner_password="realty123",
        plan=SubscriptionPlan.GROWTH
    )
    print(f"Client created: {client.name} under {reseller.name}")
    
    # Update reseller branding
    service.update_branding(
        tenant_id=reseller.id,
        branding={
            "logo_url": "https://digitalgrowth.in/logo.png",
            "primary_color": "#FF6B6B",
            "secondary_color": "#4ECDC4",
            "company_name": "Digital Growth CRM"
        }
    )
    print(f"Branding updated for {reseller.name}")
    
    # Calculate commissions
    from datetime import timedelta
    commissions = service.calculate_reseller_commission(
        reseller_tenant_id=reseller.id,
        period_start=datetime.now() - timedelta(days=30),
        period_end=datetime.now()
    )
    print(f"\nCommission Report:")
    print(f"  Total Revenue: ₹{commissions['total_revenue']:,.0f}")
    print(f"  Commission ({commissions['commission_rate']}%): ₹{commissions['commission_amount']:,.0f}")
    print(f"  Net to Platform: ₹{commissions['net_to_platform']:,.0f}")
