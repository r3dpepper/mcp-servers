#!/usr/bin/env bash
# Manage MCP Servers - Remove, Add HTTP/Stdio/cc_proxy, Status, Start/Stop/Restart
# Usage: ./scripts/manage-mcp-servers.sh [remove|add-http|add-stdio|add-all|add-cc-proxy|list|status|start|stop|restart] [server]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Server configurations: name:port
SERVERS=(
    "ddg-search:3002"
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

# Check HTTP health of all MCP servers
check_status() {
    log_info "Checking MCP server status (HTTP /health)..."
    echo ""
    printf "  %-22s %-6s %-8s %s\n" "SERVER" "PORT" "PID" "STATUS"

    local running=0
    for server_info in "${SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"
        local pid="-"
        local status="${RED}down${NC}"
        if is_running "${port}"; then
            status="${GREEN}running${NC}"
            running=$((running + 1))
            # PID of whatever is listening on the port ("-" if it vanished mid-check)
            pid=$(lsof -ti tcp:"${port}" -sTCP:LISTEN 2>/dev/null | head -1)
            [[ -z "${pid}" ]] && pid="-"
        fi
        # PID before the colored STATUS so column padding ignores escape codes
        printf "  %-22s %-6s %-8s %b\n" "${name}" "${port}" "${pid}" "${status}"
    done

    echo ""
    if [[ ${running} -eq ${#SERVERS[@]} ]]; then
        log_success "All ${#SERVERS[@]} servers are running"
    elif [[ ${running} -eq 0 ]]; then
        log_warning "No servers running. Start them with: $0 start"
    else
        log_warning "${running}/${#SERVERS[@]} servers running. Start missing ones with: $0 start"
    fi
}

# Returns 0 if the server on the given port answers its /health endpoint
is_running() {
    curl -s -m 1 "http://localhost:$1/health" >/dev/null 2>&1
}

# Resolve the target list for start/stop/restart: all servers, or one named server
# Sets TARGET_SERVERS array; returns 1 for an unknown name
resolve_targets() {
    local requested="${1:-}"
    TARGET_SERVERS=()

    if [[ -z "${requested}" ]]; then
        TARGET_SERVERS=("${SERVERS[@]}")
        return 0
    fi

    for server_info in "${SERVERS[@]}"; do
        if [[ "${server_info%%:*}" == "${requested}" ]]; then
            TARGET_SERVERS=("${server_info}")
            return 0
        fi
    done

    log_error "Unknown server '${requested}'. Valid names: ${SERVERS[*]%%:*}"
    return 1
}

# Start a single server detached in the background and wait for its health endpoint
start_one() {
    local name="$1" port="$2"

    if is_running "${port}"; then
        log_info "${name} already running on port ${port}, skipping"
        return 0
    fi

    if [[ ! -d "${PROJECT_ROOT}/servers/${name}" ]]; then
        log_error "Server directory not found: ${PROJECT_ROOT}/servers/${name}"
        return 1
    fi

    local logfile="${TMPDIR:-/tmp}/mcp-${name}.log"
    log_info "Starting ${name} on port ${port}..."
    (cd "${PROJECT_ROOT}/servers/${name}" && nohup npm run dev >"${logfile}" 2>&1 &)

    for _ in $(seq 1 20); do
        if is_running "${port}"; then
            log_success "${name} running on port ${port} (log: ${logfile})"
            return 0
        fi
        sleep 0.5
    done
    log_error "${name} did not become healthy within 10s (log: ${logfile})"
    return 1
}

# PIDs holding the given TCP port on the server side (listening or accepted
# connections), excluding clients that merely connect out to the port
port_server_pids() {
    lsof -nP -i tcp:"$1" 2>/dev/null | awk -v port="$1" '{
        local = $9
        sub(/->.*/, "", local)
        if (local ~ ":" port "$") print $2
    }' | sort -u
}

# Stop a single server by killing its process tree, then wait for the port to close
stop_one() {
    local name="$1" port="$2"

    if ! is_running "${port}"; then
        log_info "${name} not running, skipping"
        return 0
    fi

    log_info "Stopping ${name}..."

    # Process command lines don't include the server directory (npm workspaces
    # hoist node_modules to the repo root), so identify the tree by port instead:
    # each port holder plus its node/sh ancestors (npm -> sh -> node/tsx -> node)
    local -a victims=()
    local pid parent comm
    for pid in $(port_server_pids "${port}"); do
        victims+=("${pid}")
        parent=$(ps -o ppid= -p "${pid}" 2>/dev/null | tr -d ' ')
        while [[ -n "${parent}" && "${parent}" != "1" ]]; do
            comm=$(basename "$(ps -o comm= -p "${parent}" 2>/dev/null)" 2>/dev/null || true)
            if [[ "${comm}" == "node" || "${comm}" == "sh" || "${comm}" == "npm" ]]; then
                victims+=("${parent}")
                parent=$(ps -o ppid= -p "${parent}" 2>/dev/null | tr -d ' ')
            else
                break
            fi
        done
    done

    # Signal ancestors before leaves so a tsx watcher cannot respawn its child
    local i
    for (( i=${#victims[@]}-1; i>=0; i-- )); do
        kill "${victims[${i}]}" 2>/dev/null || true
    done

    for _ in $(seq 1 10); do
        if ! is_running "${port}"; then
            log_success "${name} stopped"
            return 0
        fi
        sleep 0.5
    done

    log_warning "${name} still responding after 5s, sending SIGKILL"
    for pid in $(port_server_pids "${port}"); do
        kill -9 "${pid}" 2>/dev/null || true
    done
    sleep 1
    if ! is_running "${port}"; then
        log_success "${name} stopped (forced)"
        return 0
    fi
    log_warning "${name} still responding on port ${port}"
    return 1
}

# Start servers that are not already running
start_servers() {
    resolve_targets "$1" || return 1
    local failed=0
    for server_info in "${TARGET_SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"
        start_one "${name}" "${port}" || failed=1
    done
    return ${failed}
}

# Stop servers that are currently running
stop_servers() {
    resolve_targets "$1" || return 1
    local failed=0
    for server_info in "${TARGET_SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"
        stop_one "${name}" "${port}" || failed=1
    done
    return ${failed}
}

# Restart servers (stop if running, then start)
restart_servers() {
    resolve_targets "$1" || return 1
    stop_servers "$1"
    start_servers "$1"
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
        status)
            check_status
            ;;
        start)
            start_servers "${2:-}"
            ;;
        stop)
            stop_servers "${2:-}"
            ;;
        restart)
            restart_servers "${2:-}"
            ;;
        help|*)
            echo "Usage: $0 [remove|add-http|add-stdio|add-all|add-cc-proxy|list|status|start|stop|restart] [server]"
            echo ""
            echo "Commands:"
            echo "  remove        - Remove all MCP servers (both -http and -stdio variants)"
            echo "  add-http      - Add all MCP servers with HTTP transport (named *-http)"
            echo "  add-stdio     - Add all MCP servers with stdio transport (named *-stdio)"
            echo "  add-all       - Add both HTTP and stdio transport servers"
            echo "  add-cc-proxy  - Add all MCP servers via cc_proxy with compression (named *-proxy)"
            echo "  list          - List currently configured MCP servers"
            echo "  status        - Check HTTP health of all MCP servers (which are running)"
            echo ""
            echo "Lifecycle (optionally pass a single server name, e.g. 'start memory'):"
            echo "  start         - Start servers that are not running (all if no name given)"
            echo "  stop          - Stop servers that are running (all if no name given)"
            echo "  restart       - Stop then start servers (all if no name given)"
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