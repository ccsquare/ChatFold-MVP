#!/bin/bash
#
# Check documentation naming convention
#
# This script ensures that all .md files in the docs/ directory follow
# the lowercase naming convention (except README.md).
#
# Exit codes:
#   0 - All documentation files follow naming convention
#   1 - Naming violations detected
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Checking Documentation Naming Convention ===${NC}"
echo ""

# Find all .md files in docs/ directory
DOCS_FILES=$(find docs -type f -name "*.md" 2>/dev/null || true)

if [ -z "$DOCS_FILES" ]; then
    echo -e "${GREEN}✓ No documentation files found${NC}"
    exit 0
fi

# Check each file
VIOLATIONS=()
while IFS= read -r file; do
    # Get the filename without path
    filename=$(basename "$file")

    # Skip README.md files (allowed to be uppercase)
    if [ "$filename" = "README.md" ]; then
        continue
    fi

    # Check if filename contains uppercase letters
    if echo "$filename" | grep -q '[A-Z]'; then
        VIOLATIONS+=("$file")
    fi
done <<< "$DOCS_FILES"

# Report results
if [ ${#VIOLATIONS[@]} -gt 0 ]; then
    echo -e "${RED}✗ Documentation naming violations detected!${NC}"
    echo ""
    echo "The following files contain uppercase letters in their names:"
    echo ""
    for file in "${VIOLATIONS[@]}"; do
        echo -e "  ${RED}✗${NC} $file"
    done
    echo ""
    echo -e "${YELLOW}Documentation naming convention:${NC}"
    echo "  • All .md files in docs/ must use lowercase_with_underscores.md"
    echo "  • Exception: README.md is allowed"
    echo ""
    echo "To fix, rename the files to lowercase:"
    echo ""
    for file in "${VIOLATIONS[@]}"; do
        dir=$(dirname "$file")
        old_name=$(basename "$file")
        new_name=$(echo "$old_name" | tr '[:upper:]' '[:lower:]')
        echo "  git mv \"$file\" \"$dir/$new_name\""
    done
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ All documentation files follow naming convention${NC}"
echo ""
exit 0
