#!/bin/bash

# ResourceX VS Code Extension Packaging Script

set -e

echo "🚀 ResourceX Extension Packaging Script"
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the extension directory (vscode-extension/resourcex)"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found. Installing dependencies..."
    npm install
    print_status "Dependencies installed"
fi

echo ""
echo "🔧 Building Extension..."
echo "======================="

# Clean previous build
if [ -d "out" ]; then
    rm -rf out
    print_status "Cleaned previous build"
fi

# Compile TypeScript
print_status "Compiling TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    print_error "TypeScript compilation failed"
    exit 1
fi

print_status "TypeScript compilation successful"

# Run linter
print_status "Running linter..."
npm run lint

if [ $? -ne 0 ]; then
    print_warning "Linter found issues. Please fix them for production build."
fi

# Run tests
print_status "Running tests..."
npm test

if [ $? -ne 0 ]; then
    print_warning "Some tests failed. Please review before packaging."
fi

echo ""
echo "📦 Packaging Extension..."
echo "========================"

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    print_warning "vsce not found. Installing globally..."
    npm install -g vsce
    print_status "vsce installed"
fi

# Create package
print_status "Creating VSIX package..."
vsce package

if [ $? -eq 0 ]; then
    print_status "Extension packaged successfully!"
    
    # Find the created .vsix file
    VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -n1)
    
    if [ -n "$VSIX_FILE" ]; then
        echo ""
        echo "📄 Package Information:"
        echo "======================"
        echo "File: $VSIX_FILE"
        echo "Size: $(du -h "$VSIX_FILE" | cut -f1)"
        echo ""
        echo "🛠️ Installation Commands:"
        echo "========================"
        echo "Install in VS Code:"
        echo "  code --install-extension $VSIX_FILE"
        echo ""
        echo "Or install via VS Code UI:"
        echo "  Extensions → ... → Install from VSIX → Select $VSIX_FILE"
        echo ""
        echo "🧪 Testing Commands:"
        echo "==================="
        echo "Open Extension Development Host:"
        echo "  code . → Press F5"
        echo ""
        echo "Run specific tests:"
        echo "  npm test"
        echo "  npm run compile"
        echo "  npm run lint"
    fi
else
    print_error "Packaging failed"
    exit 1
fi

echo ""
echo "🎉 Packaging Complete!"
echo "====================="
print_status "Your ResourceX extension is ready for distribution!"

# Optional: Open the containing folder
if command -v open &> /dev/null; then
    read -p "Open containing folder? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open .
    fi
elif command -v xdg-open &> /dev/null; then
    read -p "Open containing folder? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        xdg-open .
    fi
fi

echo ""
echo "📚 Next Steps:"
echo "============="
echo "1. Test the extension thoroughly in a clean VS Code instance"
echo "2. Verify all commands work with your backend"
echo "3. Test authentication and session management"
echo "4. Try code execution with various Python scripts"
echo "5. Check security analytics and result display"
echo ""
echo "🚀 Happy coding with ResourceX!" 