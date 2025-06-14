# ResourceX VS Code Extension

A powerful VS Code extension that integrates with the ResourceX platform for secure remote code execution. Send your code directly from VS Code to remote computing devices and get results back as files in your workspace.

## Features

✨ **Seamless Integration**: Execute code on remote devices directly from VS Code
🔐 **Secure Authentication**: JWT-based authentication with secure token storage
🛡️ **Advanced Security**: Built-in code analysis and security scoring
📊 **Real-time Progress**: Live progress tracking during code execution
📁 **Auto-save Results**: Automatically save execution results as markdown files
📈 **Analytics Dashboard**: View security analytics and session history
🎯 **Session Management**: Create, select, and manage multiple computing sessions

## Prerequisites

Before using this extension, ensure you have:

1. **ResourceX Backend**: The ResourceX backend server running (default: `http://localhost:5002`)
2. **User Account**: A registered account on the ResourceX platform
3. **Active Session**: At least one device rental session (created through the extension)

## Installation

### Option 1: Install from VS Code Marketplace (Coming Soon)

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "ResourceX"
4. Click Install

### Option 2: Manual Installation (Development)

1. Clone this repository
2. Navigate to the extension directory:
   ```bash
   cd vscode-extension/resourcex
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Compile the extension:
   ```bash
   npm run compile
   ```
5. Open the extension in VS Code:
   ```bash
   code .
   ```
6. Press F5 to launch the extension in a new Extension Development Host window

## Configuration

The extension can be configured through VS Code settings:

```json
{
  "resourcex.apiUrl": "http://localhost:5002",
  "resourcex.autoSaveResults": true,
  "resourcex.defaultRequirements": "numpy\npandas\nscikit-learn\nmatplotlib\n"
}
```

### Configuration Options

- **`resourcex.apiUrl`**: ResourceX backend server URL (default: `http://localhost:5002`)
- **`resourcex.autoSaveResults`**: Automatically save execution results to files (default: `true`)
- **`resourcex.defaultRequirements`**: Default Python requirements for code execution

## Usage Guide

### 1. Authentication

#### Login to ResourceX

1. Open Command Palette (Ctrl+Shift+P)
2. Run: `ResourceX: Login to ResourceX`
3. Enter your email and password
4. Upon successful login, your credentials are securely stored

#### Logout

- Run: `ResourceX: Logout from ResourceX`

### 2. Session Management

#### Create a New Session

1. Run: `ResourceX: Create New Session`
2. Select a device from available options
3. Enter session duration in hours
4. Confirm session creation

#### Select Active Session

1. Run: `ResourceX: Select Active Session`
2. Choose from your existing sessions
3. The selected session will be used for code execution

#### View All Sessions

- Run: `ResourceX: View My Sessions`
- Opens a markdown document with detailed session information

### 3. Code Execution

#### Execute Code

1. Open a Python file or select code in the editor
2. **Option A**: Right-click → Select `Execute Code on Remote Device`
3. **Option B**: Run command `ResourceX: Execute Code on Remote Device`
4. **Option C**: Use the button in the editor title bar
5. Modify Python requirements if needed
6. Monitor execution progress in the notification
7. Results will automatically open in a new markdown document

#### Get Latest Results

- Run: `ResourceX: Get Execution Results`
- Retrieves the latest execution results for the active session

### 4. Security & Analytics

#### View Security Analytics

- Run: `ResourceX: View Security Analysis`
- Opens comprehensive security analytics dashboard

## Code Execution Flow

1. **Code Selection**: Extension gets code from active editor (selected text or entire file)
2. **Security Analysis**: Code is analyzed for security risks before execution
3. **Secure Upload**: Code is encrypted and uploaded to the ResourceX backend
4. **Remote Execution**: Code runs on the selected remote device in a secure container
5. **Result Retrieval**: Execution results are fetched and displayed as markdown
6. **Auto-save**: Results are automatically saved to workspace (if enabled)

## Security Features

- **🔒 Encrypted Communication**: All data is transmitted securely using HTTPS
- **🛡️ Code Analysis**: Every code submission is analyzed for security risks
- **📊 Security Scoring**: Get detailed security scores (0-100) for your code
- **⚠️ Risk Assessment**: Automatic risk level classification (Low/Medium/High)
- **📋 Detailed Reports**: Comprehensive security analysis with recommendations

## Result Format

Execution results are displayed in markdown format with the following sections:

```markdown
# ResourceX Execution Results

**Status:** completed
**Timestamp:** 2024-01-20 10:30:00
**Session ID:** abc123ef

## Security Analysis

**Score:** 85/100
**Risk Level:** LOW
**Verdict:** APPROVED
**Analyzed At:** 2024-01-20 10:29:45

## Execution Output
```

[Your code output here]

```

```

## Commands Reference

| Command                                    | Description                              |
| ------------------------------------------ | ---------------------------------------- |
| `ResourceX: Login to ResourceX`            | Authenticate with your ResourceX account |
| `ResourceX: Logout from ResourceX`         | Sign out and clear stored credentials    |
| `ResourceX: Execute Code on Remote Device` | Send code to remote device for execution |
| `ResourceX: Create New Session`            | Rent a new computing device              |
| `ResourceX: Select Active Session`         | Choose which session to use              |
| `ResourceX: Get Execution Results`         | Retrieve latest execution results        |
| `ResourceX: View My Sessions`              | Display all your sessions                |
| `ResourceX: View Security Analysis`        | Show security analytics dashboard        |

## Keyboard Shortcuts

Currently, no default keyboard shortcuts are set. You can assign custom shortcuts in VS Code settings:

1. Go to File → Preferences → Keyboard Shortcuts
2. Search for "ResourceX"
3. Assign your preferred key combinations

## Troubleshooting

### Common Issues

#### "Please login first"

- **Solution**: Run `ResourceX: Login to ResourceX` command
- **Cause**: Not authenticated with ResourceX platform

#### "Please select or create a session first"

- **Solution**: Run `ResourceX: Create New Session` or `ResourceX: Select Active Session`
- **Cause**: No active session selected for code execution

#### "No devices available for rent"

- **Solution**: Contact ResourceX platform administrators
- **Cause**: No devices are currently available on the platform

#### "Connection failed"

- **Solution**: Check `resourcex.apiUrl` setting and ensure backend is running
- **Cause**: Backend server is not accessible

#### "Code execution timeout"

- **Solution**: Try with simpler code or check if lender device is online
- **Cause**: Code took longer than 5 minutes to execute or lender is offline

### Debug Mode

Enable debug logging by:

1. Open Developer Tools (Help → Toggle Developer Tools)
2. Check Console tab for detailed error messages
3. Look for ResourceX-specific log entries

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## Development

### Setup Development Environment

```bash
# Clone the repository
git clone <repository-url>
cd vscode-extension/resourcex

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run tests
npm test
```

### Testing the Extension

1. Open the extension in VS Code
2. Press F5 to launch Extension Development Host
3. Test all commands and functionality
4. Check for TypeScript errors: `npm run compile`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:

- 📧 Email: support@resourcex.com
- 💬 Discord: [ResourceX Community]
- 📖 Documentation: [ResourceX Docs]
- 🐛 Bug Reports: [GitHub Issues]

## Changelog

### Version 0.0.1 (Initial Release)

- ✅ User authentication with JWT tokens
- ✅ Session management (create, select, view)
- ✅ Secure code execution on remote devices
- ✅ Real-time progress tracking
- ✅ Security analysis and scoring
- ✅ Auto-save results to markdown files
- ✅ Comprehensive analytics dashboard
- ✅ Context menu integration
- ✅ Command palette support

---

**Made with ❤️ for the ResourceX Community**
