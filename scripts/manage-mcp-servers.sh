#!/usr/bin/env bash
# Manage MCP Servers - Remove, Add HTTP, Add Stdio, Add cc_proxy
# Usage: ./scripts/manage-mcp-servers.sh [remove|add-http|add-stdio|add-all|add-cc-proxy|list]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Server configurations: name:port
SERVERS=(
    "duckduckgo-search:3002"
    "browser:3003"
    "filesystem:3004"
    "fetch:3005"
    "memory:3006"
    "docker:3007"
)

# cc_proxy configuration
CC_PROXY_PORT=4141
CC_PROXY_BASE_URL="http://localhost:${CC_PROXY_PORT}/mcp"

# Project root directory
PROJECT_ROOT="/Users/jignesh/Learning/projects/mcp-servers"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Remove all MCP servers
remove_all() {
    log_info "Removing all MCP servers..."
    for server_info in "${SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"

        # Remove http, stdio, and proxy variants if they exist
        for suffix in "-http" "-stdio" "-proxy"; do
            server_name="${name}${suffix}"
            if claude mcp list 2>/dev/null | grep -q "^${server_name}"; then
                log_info "Removing ${server_name}..."
                claude mcp remove "${server_name}" --scope user 2>/dev/null || log_warning "Failed to remove ${server_name} (may not exist)"
            else
                log_info "${server_name} not found, skipping"
            fi
        done
    done
    log_success "All MCP servers removed"
}

# Add HTTP transport servers
add_http() {
    log_info "Adding MCP servers with HTTP transport..."
    for server_info in "${SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"
        server_name="${name}-http"
        url="http://localhost:${port}/mcp"

        log_info "Adding ${server_name} at ${url}..."
        if claude mcp add "${server_name}" --transport http --scope user "${url}"; then
            log_success "Added ${server_name}"
        else
            log_error "Failed to add ${server_name}"
        fi
    done
    log_success "All HTTP MCP servers added"
}

# Add stdio transport servers
add_stdio() {
    log_info "Adding MCP servers with stdio transport..."

    # First ensure build is done
    log_info "Building all servers..."
    cd "${PROJECT_ROOT}"
    if npm run build; then
        log_success "Build completed"
    else
        log_error "Build failed, cannot add stdio servers"
        return 1
    fi

    for server_info in "${SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"
        server_name="${name}-stdio"
        server_path="${PROJECT_ROOT}/servers/${name}/dist/index.js"

        if [[ ! -f "${server_path}" ]]; then
            log_error "Server binary not found: ${server_path}"
            continue
        fi

        log_info "Adding ${server_name}..."
        if claude mcp add "${server_name}" --transport stdio --scope user --env TRANSPORT=stdio -- \
            node "${server_path}"; then
            log_success "Added ${server_name}"
        else
            log_error "Failed to add ${server_name}"
        fi
    done
    log_success "All stdio MCP servers added"
}

# Add both HTTP and stdio
add_all() {
    add_http
    echo ""
    add_stdio
}

# Add MCP servers via cc_proxy (with compression)
add_cc_proxy() {
    log_info "Adding MCP servers via cc_proxy (port ${CC_PROXY_PORT})..."

    # Check if cc_proxy is running
    if ! curl -s "http://localhost:${CC_PROXY_PORT}/healthz" >/dev/null 2>&1; then
        log_warning "cc_proxy does not appear to be running on port ${CC_PROXY_PORT}"
        log_info "Start cc_proxy first: cd /Users/jignesh/Learning/projects/cc_proxy && ./cc_proxy"
        return 1
    fi

    for server_info in "${SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"
        server_name="${name}-proxy"
        url="${CC_PROXY_BASE_URL}/${name}"

        log_info "Adding ${server_name} at ${url}..."
        if claude mcp add "${server_name}" --transport http --scope user "${url}"; then
            log_success "Added ${server_name}"
        else
            log_error "Failed to add ${server_name}"
        fi
    done
    log_success "All cc_proxy MCP servers added"
}

# List current MCP servers
list_servers() {
    log_info "Current MCP servers:"
    claude mcp list --scope user 2>/dev/null || log_warning "No servers configured or claude CLI not available"
}

# Main function
main() {
    local action="${1:-help}"

    case "${action}" in
        remove)
            remove_all
            ;;
        add-http)
            add_http
            ;;
        add-stdio)
            add_stdio
            ;;
        add-all)
            add_all
            ;;
        add-cc-proxy)
            add_cc_proxy
            ;;
        list)
            list_servers
            ;;
        help|*)
            echo "Usage: $0 [remove|add-http|add-stdio|add-all|add-cc-proxy|list]"
            echo ""
            echo "Commands:"
            echo "  remove        - Remove all MCP servers (both -http and -stdio variants)"
            echo "  add-http      - Add all MCP servers with HTTP transport (named *-http)"
            echo "  add-stdio     - Add all MCP servers with stdio transport (named *-stdio)"
            echo "  add-all       - Add both HTTP and stdio transport servers"
            echo "  add-cc-proxy  - Add all MCP servers via cc_proxy with compression (named *-proxy)"
            echo "  list          - List currently configured MCP servers"
            echo ""
            echo "Servers managed:"
            for server_info in "${SERVERS[@]}"; do
                IFS=':' read -r name port <<< "$server_info"
                echo "  - ${name} (port ${port})"
            done
            echo ""
            echo "cc_proxy:"
            echo "  - Runs on port ${CC_PROXY_PORT}"
            echo "  - MCP endpoints: http://localhost:${CC_PROXY_PORT}/mcp/<server-name>"
            echo "  - Provides tool schema compression (medium by default)"
            ;;
    esac
}

main "$@"