"""Explicit single-origin control and capture transport, without provisioning.

The child applications retain their own authorization, transactions and closed
errors. This factory is not mounted by the default application or local preview.
"""

from fastapi.routing import APIRoute
from starlette.applications import Starlette
from starlette.routing import Route

from services.api.auth import Authenticator
from services.api.control_app import create_control_app
from services.api.ingress_app import _error, create_ingress_app


def create_capture_app(store=None, authenticator: Authenticator | None = None, *,
                       capabilities=None, stop_fact_resolver=None, clock=None,
                       enable_raw_ingress=False, enable_desktop_ingress=False,
                       enable_windows_ingress=False):
    """Compose existing root paths; all authority comes from the trusted caller."""
    options = dict(capabilities=capabilities, stop_fact_resolver=stop_fact_resolver, clock=clock)
    control = create_control_app(store, authenticator, **options)
    ingress = create_ingress_app(store, authenticator, **options,
                                 enable_raw_ingress=enable_raw_ingress,
                                 enable_desktop_ingress=enable_desktop_ingress,
                                 enable_windows_ingress=enable_windows_ingress)

    # Delegate all methods with the full path intact. The child router decides
    # method matches, including identifiers ending in ':control', and refusals.
    routes = [Route(route.path, endpoint=control) for route in control.routes
              if isinstance(route, APIRoute)]
    # The released component names differ across families. Expose no partial or
    # silently overwritten common schema; consumers use their released contracts.
    no_schema = _error(404, "not_found")
    no_schema.headers["Cache-Control"] = "no-store"
    no_schema.headers["X-Content-Type-Options"] = "nosniff"
    routes.append(Route("/openapi.json", endpoint=no_schema))
    routes.append(Route("/{path:path}", endpoint=ingress))
    app = Starlette(routes=routes)
    app.router.redirect_slashes = False
    app.state.store = store
    app.state.authenticator = authenticator
    app.state.paid_executor_enabled = False
    return app
