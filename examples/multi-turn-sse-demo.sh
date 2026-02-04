#!/bin/bash
# =============================================================================
# Kepler Chat - Multi-Turn SSE Demo
# =============================================================================
# This script demonstrates the complete flow from sign-up to multi-turn chat
# with Server-Sent Events (SSE) streaming using standard SSE format.
#
# SSE Format:
#   id: <timestamp>
#   event: <event-type>
#   data: <json-payload>
#
# Usage: ./examples/multi-turn-sse-demo.sh
# =============================================================================

set -e

API_URL="${API_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/kepler-demo-cookies-$$.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleanup() {
  rm -f "$COOKIE_JAR"
}
trap cleanup EXIT

log() {
  echo -e "${BLUE}==>${NC} $1"
}

success() {
  echo -e "${GREEN}✓${NC} $1"
}

error() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}

# Parse standard SSE format and extract text deltas
parse_sse_response() {
  local response="$1"
  local full_text=""
  
  # Process each SSE block (separated by double newlines)
  while IFS= read -r line; do
    # Extract event type
    if [[ "$line" == event:* ]]; then
      current_event="${line#event: }"
    fi
    
    # Extract and parse data
    if [[ "$line" == data:* ]]; then
      local json="${line#data: }"
      
      # For message.part.updated events, extract delta text
      if [[ "$current_event" == "message.part.updated" ]]; then
        local delta=$(echo "$json" | jq -r '.delta // empty' 2>/dev/null)
        local part_type=$(echo "$json" | jq -r '.part.type // empty' 2>/dev/null)
        if [[ -n "$delta" && "$part_type" == "text" ]]; then
          full_text+="$delta"
          echo -e "    ${CYAN}[delta]${NC} $delta"
        fi
      fi
      
      # Check for completion
      if [[ "$current_event" == "message.updated" ]]; then
        local completed=$(echo "$json" | jq -r '.info.time.completed // empty' 2>/dev/null)
        if [[ -n "$completed" ]]; then
          echo -e "    ${GREEN}[completed]${NC}"
        fi
      fi
    fi
  done <<< "$response"
  
  echo "$full_text"
}

# =============================================================================
# Main Demo
# =============================================================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  KEPLER CHAT - Multi-Turn SSE Demo (Standard Format)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

TEST_EMAIL="demo-$(date +%s)@example.com"
TEST_PASSWORD="password123"
TEST_NAME="Demo User"

# =============================================================================
# Step 1: Sign Up
# =============================================================================
log "Step 1: Creating account ($TEST_EMAIL)"

SIGNUP_RESPONSE=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$API_URL/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "Origin: $API_URL" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"name\": \"$TEST_NAME\"
  }")

if echo "$SIGNUP_RESPONSE" | jq -e '.user.id' > /dev/null 2>&1; then
  USER_ID=$(echo "$SIGNUP_RESPONSE" | jq -r '.user.id')
  success "Account created (ID: $USER_ID)"
else
  error "Sign-up failed: $SIGNUP_RESPONSE"
fi

# =============================================================================
# Step 2: Sign In
# =============================================================================
log "Step 2: Signing in"

SIGNIN_RESPONSE=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$API_URL/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -H "Origin: $API_URL" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

if echo "$SIGNIN_RESPONSE" | jq -e '.token' > /dev/null 2>&1; then
  success "Signed in successfully"
else
  error "Sign-in failed: $SIGNIN_RESPONSE"
fi

# =============================================================================
# Step 3: Create Conversation
# =============================================================================
log "Step 3: Creating conversation"

CONV_RESPONSE=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$API_URL/api/conversations" \
  -H "Content-Type: application/json" \
  -H "Origin: $API_URL" \
  -d '{"title": "Multi-Turn Math Demo"}')

if echo "$CONV_RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
  CONV_ID=$(echo "$CONV_RESPONSE" | jq -r '.id')
  SESSION_ID=$(echo "$CONV_RESPONSE" | jq -r '.session.id')
  success "Conversation created (ID: $CONV_ID)"
  echo "    OpenCode Session: $SESSION_ID"
else
  error "Failed to create conversation: $CONV_RESPONSE"
fi

# =============================================================================
# Step 4: First Message (SSE Stream)
# =============================================================================
echo ""
log "Step 4: Sending first message with SSE streaming"
echo ""
echo -e "  ${BLUE}User:${NC} What is 5 + 3? Reply with just the number."
echo ""
echo -e "  ${BLUE}SSE Events (Standard Format):${NC}"

FIRST_RESPONSE=$(curl -N -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$API_URL/api/conversations/$CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Origin: $API_URL" \
  -d '{"text": "What is 5 + 3? Reply with just the number."}' \
  --max-time 60 2>&1)

# Show raw SSE format for first few events
echo -e "  ${CYAN}Raw SSE (first 20 lines):${NC}"
echo "$FIRST_RESPONSE" | head -20 | sed 's/^/    /'
echo ""

# Wait a moment and fetch the result
sleep 2

# =============================================================================
# Step 5: Follow-up Message (Multi-Turn Context)
# =============================================================================
echo ""
log "Step 5: Sending follow-up message (testing context retention)"
echo ""
echo -e "  ${BLUE}User:${NC} Now multiply that by 10. Reply with just the number."
echo ""
echo -e "  ${BLUE}SSE Events:${NC}"

SECOND_RESPONSE=$(curl -N -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$API_URL/api/conversations/$CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Origin: $API_URL" \
  -d '{"text": "Now multiply that by 10. Reply with just the number."}' \
  --max-time 60 2>&1)

echo -e "  ${CYAN}Raw SSE (first 20 lines):${NC}"
echo "$SECOND_RESPONSE" | head -20 | sed 's/^/    /'
echo ""

# Wait for completion
sleep 2

# =============================================================================
# Step 6: Fetch Conversation History
# =============================================================================
echo ""
log "Step 6: Fetching complete conversation history"
echo ""

MESSAGES=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  "$API_URL/api/conversations/$CONV_ID/messages" \
  -H "Origin: $API_URL")

echo "$MESSAGES" | jq -r '.[] | "  \(.info.role | ascii_upcase): \(.parts[] | select(.type == "text") | .text | gsub("^\\n"; ""))"'

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Demo Complete!${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Conversation ID: $CONV_ID"
echo "  User Email: $TEST_EMAIL"
echo ""
echo -e "  ${GREEN}SSE Format (Standard):${NC}"
echo "    id: <timestamp>"
echo "    event: <message.updated|message.part.updated>"
echo "    data: <json-payload>"
echo ""
echo -e "  ${GREEN}Key Events:${NC}"
echo "    - message.updated: Message metadata (user/assistant info)"
echo "    - message.part.updated: Content parts (text, with 'delta' for streaming)"
echo ""
echo -e "  ${GREEN}Svelte Integration:${NC}"
echo "    Use fetch() with ReadableStream to consume SSE"
echo "    Parse each block: id/event/data on separate lines"
echo ""
