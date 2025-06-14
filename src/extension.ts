// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios, { AxiosResponse } from 'axios';

// Interfaces for better type safety
interface DeviceQuickPickItem extends vscode.QuickPickItem {
	deviceData: any;
}

interface SessionQuickPickItem extends vscode.QuickPickItem {
	session: any;
}

// Global state for authentication and session management
let currentUser: any = null;
let isAuthenticated: boolean = false;
let isCheckingAuth: boolean = false;
let activeSessionId: string | null = null;
let sessions: any[] = [];
let authToken: string | null = null;

// Configuration helper
function getApiUrl(): string {
	const config = vscode.workspace.getConfiguration('resourcex');
	return config.get<string>('apiUrl') || 'http://localhost:5002';
}

// Configure axios to use credentials (cookies) like the frontend
axios.defaults.withCredentials = true;

// Enhanced Authentication Helper for VS Code Extension
class AuthManager {
	private static context: vscode.ExtensionContext | undefined;

	// Initialize context properly
	static initialize(context: vscode.ExtensionContext) {
		AuthManager.context = context;
		// Load stored token on initialization
		authToken = context.globalState.get('authToken') || null;
	}

	static async checkAuth(): Promise<boolean> {
		isCheckingAuth = true;
		try {
			console.log('Checking auth at URL:', `${getApiUrl()}/api/auth/check-auth`);
			
			const headers: any = {
				'Content-Type': 'application/json',
				'User-Agent': 'ResourceX-VSCode-Extension/1.0.0'
			};

			// If we have a stored token, use it in Authorization header
			if (authToken) {
				headers['Authorization'] = `Bearer ${authToken}`;
			}

			const response = await axios.get(`${getApiUrl()}/api/auth/check-auth`, {
				headers,
				withCredentials: true,
				validateStatus: (status) => status < 500 // Don't throw on 4xx errors
			});

			console.log('Auth response status:', response.status);
			console.log('Auth response data:', response.data);
			
			if (response.status === 200 && response.data.success) {
				currentUser = response.data.user;
				isAuthenticated = true;
				isCheckingAuth = false;
				
				console.log('Authentication successful, user:', currentUser?.name);
				return true;
			} else {
				// Reset auth state
				await AuthManager.clearAuthState();
				return false;
			}
			
		} catch (error: any) {
			console.error('Auth check failed:');
			console.error('Status:', error.response?.status);
			console.error('Data:', error.response?.data);
			console.error('Error message:', error.message);
			
			// Reset auth state on error
			await AuthManager.clearAuthState();
			return false;
		}
	}

	static async clearAuthState(): Promise<void> {
		currentUser = null;
		isAuthenticated = false;
		isCheckingAuth = false;
		authToken = null;
		activeSessionId = null;
		sessions = [];
		
		// Clear stored token
		if (AuthManager.context) {
			await AuthManager.context.globalState.update('authToken', undefined);
		}
	}

	static isUserAuthenticated(): boolean {
		console.log('Checking authentication state:');
		console.log('isAuthenticated:', isAuthenticated);
		console.log('currentUser:', currentUser?.name || 'null');
		console.log('authToken:', authToken ? 'exists' : 'null');
		
		const authenticated = isAuthenticated && currentUser !== null && authToken !== null;
		console.log('Final authenticated result:', authenticated);
		return authenticated;
	}

	static getCurrentUser(): any {
		return currentUser;
	}

	static getHeaders() {
		const headers: any = {
			'Content-Type': 'application/json',
			'User-Agent': 'ResourceX-VSCode-Extension/1.0.0'
		};

		if (authToken) {
			headers['Authorization'] = `Bearer ${authToken}`;
		}

		return headers;
	}

	// Enhanced token authentication
	static async authenticateWithToken(): Promise<boolean> {
		try {
			const token = await vscode.window.showInputBox({
				prompt: 'Enter your authentication token (JWT from browser)',
				placeHolder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
				password: true,
				ignoreFocusOut: true,
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Token cannot be empty';
					}
					// Basic JWT format validation
					const parts = value.split('.');
					if (parts.length !== 3) {
						return 'Invalid JWT format (should have 3 parts separated by dots)';
					}
					return null;
				}
			});

			if (!token) {
				return false;
			}

			const trimmedToken = token.trim();

			// Test the token
			const response = await axios.get(`${getApiUrl()}/api/auth/check-auth`, {
				headers: {
					'Authorization': `Bearer ${trimmedToken}`,
					'Content-Type': 'application/json',
					'User-Agent': 'ResourceX-VSCode-Extension/1.0.0'
				},
				withCredentials: true,
				timeout: 10000
			});

			if (response.data.success && response.data.user) {
				authToken = trimmedToken;
				currentUser = response.data.user;
				isAuthenticated = true;

				// Store token in VS Code global state
				if (AuthManager.context) {
					await AuthManager.context.globalState.update('authToken', trimmedToken);
				}

				vscode.window.showInformationMessage(
					`✅ Successfully authenticated as ${currentUser.name}!`,
					'View Profile'
				).then(selection => {
					if (selection === 'View Profile') {
						vscode.window.showInformationMessage(
							`Name: ${currentUser.name}\nEmail: ${currentUser.email}\nRole: ${currentUser.role || 'User'}`
						);
					}
				});
				return true;
			} else {
				vscode.window.showErrorMessage('❌ Invalid token or authentication failed');
				return false;
			}
		} catch (error: any) {
			console.error('Token authentication failed:', error);
			
			let errorMessage = 'Authentication failed';
			if (error.response?.status === 401) {
				errorMessage = 'Invalid or expired token';
			} else if (error.code === 'ECONNREFUSED') {
				errorMessage = 'Cannot connect to ResourceX server. Is it running?';
			} else if (error.response?.data?.message) {
				errorMessage = error.response.data.message;
			}
			
			vscode.window.showErrorMessage(`❌ ${errorMessage}`);
			return false;
		}
	}

	// Enhanced login prompt
	static async promptLogin(): Promise<void> {
		const result = await vscode.window.showWarningMessage(
			'🔐 Authentication required to use ResourceX features',
			{
				modal: false,
				detail: 'Choose how you want to authenticate with ResourceX'
			},
			'🌐 Open ResourceX Login',
			'🔑 Enter Auth Token',
			'🔄 Check Auth Again',
			'❓ How to get token'
		);

		if (result === '🌐 Open ResourceX Login') {
			const frontendUrl = getApiUrl().replace(':5002', ':5173');
			await vscode.env.openExternal(vscode.Uri.parse(frontendUrl));
			
			// Show follow-up instructions
			setTimeout(() => {
				vscode.window.showInformationMessage(
					'After logging in, copy your auth token and use "🔑 Enter Auth Token"',
					'Got it'
				);
			}, 2000);
			
		} else if (result === '🔑 Enter Auth Token') {
			await AuthManager.authenticateWithToken();
			
		} else if (result === '🔄 Check Auth Again') {
			const authenticated = await AuthManager.checkAuth();
			if (authenticated) {
				vscode.window.showInformationMessage(`✅ Welcome back, ${currentUser.name}!`);
			} else {
				vscode.window.showWarningMessage('❌ Still not authenticated. Try entering your auth token.');
			}
			
		} else if (result === '❓ How to get token') {
			AuthManager.showTokenExtractionInstructions();
		}
	}

	// Enhanced token extraction instructions
	static showTokenExtractionInstructions(): void {
		const panel = vscode.window.createWebviewPanel(
			'tokenInstructions',
			'🔑 Get Authentication Token',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		panel.webview.html = `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Authentication Token Instructions</title>
			<style>
				body { 
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
					padding: 20px; 
					line-height: 1.6; 
					max-width: 800px;
					margin: 0 auto;
				}
				.step { 
					margin: 15px 0; 
					padding: 15px; 
					background: #f8f9fa; 
					border-left: 4px solid #007acc; 
					border-radius: 4px;
				}
				.step h3 { margin-top: 0; color: #007acc; }
				code { 
					background: #e9ecef; 
					padding: 2px 6px; 
					border-radius: 3px; 
					font-family: 'Monaco', 'Consolas', monospace;
				}
				.highlight { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; }
				.warning { background: #f8d7da; padding: 10px; border-radius: 4px; margin: 10px 0; }
				ul { padding-left: 20px; }
				li { margin: 5px 0; }
				.copy-btn { 
					background: #007acc; 
					color: white; 
					border: none; 
					padding: 8px 12px; 
					border-radius: 4px; 
					cursor: pointer; 
					margin: 5px 0;
				}
				.copy-btn:hover { background: #005999; }
			</style>
		</head>
		<body>
			<h1>🔑 Get Your ResourceX Authentication Token</h1>
			
			<div class="highlight">
				<strong>💡 Quick Summary:</strong> Login to ResourceX in your browser, open developer tools, 
				find your JWT token, then paste it in VS Code.
			</div>

			<div class="step">
				<h3>Step 1: Login to ResourceX</h3>
				<p>1. Open your browser and go to <code>http://localhost:5173</code></p>
				<p>2. Login with your ResourceX credentials</p>
				<p>3. Make sure you're successfully logged in (you should see your dashboard)</p>
			</div>

			<div class="step">
				<h3>Step 2: Open Developer Tools</h3>
				<p><strong>Chrome/Edge:</strong> Press <code>F12</code> or <code>Ctrl+Shift+I</code> (Windows) / <code>Cmd+Option+I</code> (Mac)</p>
				<p><strong>Firefox:</strong> Press <code>F12</code> or <code>Ctrl+Shift+I</code> (Windows) / <code>Cmd+Option+I</code> (Mac)</p>
				<p><strong>Safari:</strong> Press <code>Cmd+Option+I</code> (you may need to enable developer tools first)</p>
			</div>

			<div class="step">
				<h3>Step 3: Find Your JWT Token</h3>
				
				<p><strong>🎯 Method 1: Application/Storage Tab (Recommended)</strong></p>
				<ul>
					<li>Click on the <code>Application</code> tab (Chrome/Edge) or <code>Storage</code> tab (Firefox)</li>
					<li>In the sidebar, expand <code>Cookies</code></li>
					<li>Click on <code>http://localhost:5173</code></li>
					<li>Look for a cookie named <code>token</code></li>
					<li>Double-click the <strong>Value</strong> field and copy the entire token</li>
				</ul>

				<p><strong>🌐 Method 2: Network Tab</strong></p>
				<ul>
					<li>Click on the <code>Network</code> tab</li>
					<li>Refresh the page or make any action in ResourceX</li>
					<li>Look for API requests (usually starting with <code>/api/auth/</code>)</li>
					<li>Click on a request</li>
					<li>In the <code>Request Headers</code> section, look for <code>Authorization: Bearer YOUR_TOKEN</code></li>
					<li>Copy everything after <code>Bearer </code></li>
				</ul>
			</div>

			<div class="step">
				<h3>Step 4: Use Token in VS Code</h3>
				<p>1. Go back to VS Code</p>
				<p>2. Run the command: <code>ResourceX: Enter Auth Token</code></p>
				<p>3. Paste your copied token</p>
				<p>4. Press Enter</p>
			</div>

			<div class="warning">
				<strong>⚠️ Important:</strong>
				<ul>
					<li>Your token is like a password - keep it secure!</li>
					<li>Tokens usually expire after some time, so you may need to repeat this process</li>
					<li>The token should start with something like <code>eyJhbGciOiJIUzI1NiI...</code></li>
				</ul>
			</div>

			<div class="highlight">
				<strong>🆘 Still having trouble?</strong> 
				<ul>
					<li>Make sure ResourceX backend is running on port 5002</li>
					<li>Try logging out and logging back in to get a fresh token</li>
					<li>Check that VS Code can access localhost (firewall/antivirus)</li>
				</ul>
			</div>
		</body>
		</html>
		`;
	}


}

// Session Management
class SessionManager {
	static async loadSessions(): Promise<void> {
		if (!AuthManager.isUserAuthenticated()) {
			return;
		}

		try {
			const response = await axios.get(`${getApiUrl()}/api/session/renter`, {
				headers: AuthManager.getHeaders()
			});

			if (response.data.success) {
				sessions = response.data.sessions;
			}
		} catch (error: any) {
			console.error('Error loading sessions:', error);
			if (error.response?.status === 401) {
				await AuthManager.clearAuthState();
			}
		}
	}

	static async createSession(): Promise<boolean> {
		if (!AuthManager.isUserAuthenticated()) {
			await AuthManager.promptLogin();
			return false;
		}

		try {
			// Get available devices
			console.log('Fetching devices from:', `${getApiUrl()}/api/device`);
			const devicesResponse = await axios.get(`${getApiUrl()}/api/device`, {
				headers: AuthManager.getHeaders(),
				timeout: 15000 // 15 second timeout
			});

			console.log('Devices response status:', devicesResponse.status);
			console.log('Devices response data:', devicesResponse.data);

			// Fix: Backend returns devices directly as array, not wrapped in success/devices object
			if (!Array.isArray(devicesResponse.data) || devicesResponse.data.length === 0) {
				vscode.window.showErrorMessage('No devices available for rent');
				return false;
			}

			// Show device selection - filter for available devices only
			const availableDevices = devicesResponse.data.filter((device: any) => device.isAvailable);
			
			if (availableDevices.length === 0) {
				vscode.window.showErrorMessage('No available devices for rent at the moment');
				return false;
			}

			const deviceItems: DeviceQuickPickItem[] = availableDevices.map((device: any) => ({
				label: `${device.deviceName} (${device.deviceType})`,
				description: `Owner: ${device.owner.name} - $${device.price}/hour - Performance: ${device.performance}`,
				detail: `Location: ${device.location} | Specs: ${Object.entries(device.specs || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'N/A'}`,
				deviceData: device
			}));

			const selectedDevice = await vscode.window.showQuickPick(deviceItems, {
				placeHolder: 'Select a device to rent',
				matchOnDescription: true,
				matchOnDetail: true
			});

			if (!selectedDevice || !selectedDevice.deviceData) {
				return false;
			}

			// Get programming language for the session
			const language = await vscode.window.showQuickPick([
				{ label: 'Python', value: 'python' },
				{ label: 'JavaScript/Node.js', value: 'javascript' },
				{ label: 'R', value: 'r' },
				{ label: 'Julia', value: 'julia' }
			], {
				placeHolder: 'Select programming language for your session'
			});

			if (!language) {
				return false;
			}

			// Create session
			console.log('Creating session with payload:', {
				deviceId: selectedDevice.deviceData._id,
				language: language.value
			});
			console.log('API URL:', `${getApiUrl()}/api/session`);
			console.log('Headers:', AuthManager.getHeaders());

			const response = await axios.post(`${getApiUrl()}/api/session`, {
				deviceId: selectedDevice.deviceData._id,
				language: language.value
			}, {
				headers: AuthManager.getHeaders(),
				timeout: 30000, // 30 second timeout
				withCredentials: true,
				validateStatus: (status) => status < 500 // Don't throw on 4xx errors
			});

			console.log('Session creation response status:', response.status);
			console.log('Session creation response data:', response.data);

			if (response.status === 200 || response.status === 201) {
				if (response.data.success && response.data.sessionId) {
					// Fix: Backend returns sessionId, not session object
					activeSessionId = response.data.sessionId;
					await SessionManager.loadSessions();
					
					// Show success message with more details
					const sessionIdShort = activeSessionId?.toString().substr(-8) || 'unknown';
					vscode.window.showInformationMessage(
						`✅ Session created successfully!\n` +
						`Session ID: ${sessionIdShort}\n` +
						`Device: ${selectedDevice.deviceData.deviceName}\n` +
						`Language: ${language.label}\n` +
						`Status: Pending owner approval`,
						'View Sessions',
						'Start Coding'
					).then(selection => {
						if (selection === 'View Sessions') {
							vscode.commands.executeCommand('resourcex.viewSessions');
						} else if (selection === 'Start Coding') {
							vscode.window.showInformationMessage(
								'💡 Your session is pending approval. Once approved, you can execute code using "ResourceX: Execute Code"'
							);
						}
					});
					
					return true;
				} else if (response.data.message) {
					vscode.window.showErrorMessage('Failed to create session: ' + response.data.message);
					return false;
				} else {
					vscode.window.showErrorMessage('Failed to create session: Unknown server response');
					return false;
				}
			} else {
				const errorMsg = response.data?.message || `Server returned status ${response.status}`;
				vscode.window.showErrorMessage('Failed to create session: ' + errorMsg);
				return false;
			}
		} catch (error: any) {
			console.error('Session creation error:', error);
			console.error('Error status:', error.response?.status);
			console.error('Error data:', error.response?.data);
			console.error('Error message:', error.message);
			
			if (error.response?.status === 401) {
				await AuthManager.promptLogin();
			} else if (error.code === 'ECONNREFUSED') {
				vscode.window.showErrorMessage('Cannot connect to ResourceX server. Is it running on ' + getApiUrl() + '?');
			} else if (error.code === 'TIMEOUT' || error.code === 'ECONNABORTED') {
				vscode.window.showErrorMessage('Session creation timed out. Please try again.');
			} else {
				const errorMsg = error.response?.data?.message || error.message || 'Unknown error occurred';
				vscode.window.showErrorMessage('Error creating session: ' + errorMsg);
			}
			return false;
		}
	}

	static async selectSession(): Promise<void> {
		if (!AuthManager.isUserAuthenticated()) {
			await AuthManager.promptLogin();
			return;
		}

		await SessionManager.loadSessions();

		if (!sessions.length) {
			const result = await vscode.window.showInformationMessage(
				'No sessions available. Would you like to create a new session?',
				'Create Session',
				'Cancel'
			);
			
			if (result === 'Create Session') {
				await SessionManager.createSession();
			}
			return;
		}

		const sessionItems: SessionQuickPickItem[] = sessions.map(session => {
			const deviceName = session.device?.deviceName || 'Unknown Device';
			const deviceType = session.device?.deviceType || 'Unknown';
			const status = session.status || 'unknown';
			const executionStatus = session.executionStatus || 'not started';
			const createdAt = session.createdAt ? new Date(session.createdAt).toLocaleString() : 'Unknown';
			
			// Create status indicator
			let statusIcon = '⚪';
			if (status === 'active') statusIcon = '🟢';
			else if (status === 'completed') statusIcon = '🔵';
			else if (status === 'rejected') statusIcon = '🔴';
			else if (status === 'requested') statusIcon = '🟡';
			
			let executionIcon = '';
			if (executionStatus === 'pending') executionIcon = ' ⏳';
			else if (executionStatus === 'completed') executionIcon = ' ✅';
			else if (executionStatus === 'failed') executionIcon = ' ❌';
			else if (executionStatus === 'rejected') executionIcon = ' 🚫';
			
			return {
				label: `${statusIcon} Session ${session._id?.substr(-8) || 'unknown'}${executionIcon}`,
				description: `${deviceName} (${deviceType}) - ${status}`,
				detail: `Created: ${createdAt} | Execution: ${executionStatus}`,
				session: session
			};
		});

		const selectedSession = await vscode.window.showQuickPick(sessionItems, {
			placeHolder: 'Select a session to work with',
			matchOnDescription: true,
			matchOnDetail: true
		});

		if (selectedSession && selectedSession.session) {
			activeSessionId = selectedSession.session._id;
			const sessionIdShort = activeSessionId?.substr(-8) || 'unknown';
			const deviceName = selectedSession.session.device?.deviceName || 'Unknown Device';
			const status = selectedSession.session.status || 'unknown';
			
			vscode.window.showInformationMessage(
				`✅ Selected session: ${sessionIdShort}\nDevice: ${deviceName}\nStatus: ${status}`,
				'Execute Code',
				'View Results',
				'View Details'
			).then(selection => {
				if (selection === 'Execute Code') {
					vscode.commands.executeCommand('resourcex.executeCode');
				} else if (selection === 'View Results') {
					vscode.commands.executeCommand('resourcex.getResults');
				} else if (selection === 'View Details') {
					vscode.commands.executeCommand('resourcex.viewSessions');
				}
			});
		}
	}

	static getActiveSessionId(): string | null {
		return activeSessionId;
	}
}

// Code Execution Manager
class CodeExecutor {
	static async executeCode(): Promise<void> {
		if (!AuthManager.isUserAuthenticated()) {
			await AuthManager.promptLogin();
			return;
		}

		if (!activeSessionId) {
			const result = await vscode.window.showWarningMessage(
				'No active session selected. You need a session to execute code.',
				'Create New Session',
				'Select Existing Session',
				'Cancel'
			);
			
			if (result === 'Create New Session') {
				const created = await SessionManager.createSession();
				if (!created) return;
			} else if (result === 'Select Existing Session') {
				await SessionManager.selectSession();
				if (!activeSessionId) return;
			} else {
				return;
			}
		}

		// Step 1: Choose execution mode with enhanced file upload options
		const executionMode = await vscode.window.showQuickPick([
			{
				label: '📄 Upload Python File',
				description: 'Select a .py file from your computer',
				detail: 'Browse and select a Python file to execute',
				mode: 'file-upload'
			},
			{
				label: '📦 Upload Project Files',
				description: 'Select Python file + requirements.txt',
				detail: 'Choose both a .py file and requirements.txt file',
				mode: 'project-upload'
			},
			{
				label: '📝 Execute Current File',
				description: 'Run the entire current file in editor',
				detail: 'Executes all code in the currently open file',
				mode: 'current-file'
			},
			{
				label: '🎯 Execute Selected Code',
				description: 'Run only the selected/highlighted code',
				detail: 'Executes only the code you have selected in the editor',
				mode: 'selection'
			},
			{
				label: '📁 Upload Workspace Folder',
				description: 'Upload entire project folder (Coming Soon)',
				detail: 'Send complete project structure with multiple files',
				mode: 'workspace'
			}
		], {
			placeHolder: '🚀 Choose how you want to execute your code',
			ignoreFocusOut: true
		});

		if (!executionMode) return;

		try {
			switch (executionMode.mode) {
				case 'file-upload':
					await CodeExecutor.handleFileUpload();
					break;
				case 'project-upload':
					await CodeExecutor.handleProjectUpload();
					break;
				case 'current-file':
					await CodeExecutor.handleCurrentFile();
					break;
				case 'selection':
					await CodeExecutor.handleSelectedCode();
					break;
				case 'workspace':
					vscode.window.showInformationMessage(
						'🚧 Workspace upload is coming soon! For now, please use "Upload Project Files" mode.',
						'Got it'
					);
					break;
			}
		} catch (error: any) {
			console.error('Code execution setup error:', error);
			vscode.window.showErrorMessage('❌ Error setting up code execution: ' + error.message);
		}
	}

	private static async handleFileUpload(): Promise<void> {
		// Step 1: Select Python file
		const pythonFiles = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'Python Files': ['py'],
				'All Files': ['*']
			},
			title: '📄 Select Python File to Execute'
		});

		if (!pythonFiles || pythonFiles.length === 0) {
			vscode.window.showInformationMessage('❌ No Python file selected.');
			return;
		}

		const pythonFile = pythonFiles[0];
		
		// Read file content
		const fileContent = await vscode.workspace.fs.readFile(pythonFile);
		const code = Buffer.from(fileContent).toString('utf8');
		const fileName = pythonFile.path.split('/').pop() || 'uploaded.py';

		if (!code.trim()) {
			vscode.window.showErrorMessage('❌ The selected Python file is empty.');
			return;
		}

		// Step 2: Ask for requirements
		const useCustomReqs = await vscode.window.showQuickPick([
			{
				label: '📝 Enter Requirements Manually',
				description: 'Type Python packages needed',
				picked: true,
				mode: 'manual'
			},
			{
				label: '📄 Upload requirements.txt',
				description: 'Select a requirements.txt file',
				mode: 'file'
			},
			{
				label: '⚡ Use Default Requirements',
				description: 'Use common packages (numpy, pandas, matplotlib)',
				mode: 'default'
			}
		], {
			placeHolder: '📦 How do you want to specify Python requirements?'
		});

		if (!useCustomReqs) return;

		let requirements = '';
		
		switch (useCustomReqs.mode) {
			case 'manual':
				const config = vscode.workspace.getConfiguration('resourcex');
				const defaultReqs = config.get<string>('defaultRequirements') || 'numpy\npandas\nmatplotlib\nrequests';
				
				const manualReqs = await vscode.window.showInputBox({
					prompt: '📦 Enter Python packages (one per line)',
					value: defaultReqs,
					placeHolder: 'numpy\npandas\nmatplotlib\nrequests',
					ignoreFocusOut: true,
					validateInput: (value) => {
						if (!value || value.trim().length === 0) {
							return '⚠️ Please specify at least basic requirements';
						}
						return null;
					}
				});
				
				if (manualReqs === undefined) return;
				requirements = manualReqs;
				break;

			case 'file':
				const reqFiles = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: false,
					canSelectMany: false,
					filters: {
						'Requirements Files': ['txt'],
						'All Files': ['*']
					},
					title: '📄 Select requirements.txt File'
				});

				if (!reqFiles || reqFiles.length === 0) {
					vscode.window.showInformationMessage('❌ No requirements file selected. Using defaults.');
					requirements = 'numpy\npandas\nmatplotlib\nrequests';
				} else {
					const reqContent = await vscode.workspace.fs.readFile(reqFiles[0]);
					requirements = Buffer.from(reqContent).toString('utf8');
				}
				break;

			case 'default':
				requirements = 'numpy\npandas\nmatplotlib\nrequests\nscipy\nsklearn';
				break;
		}

		// Step 3: Show upload summary and execute
		await CodeExecutor.executeUploadedFiles(code, fileName, requirements, 'Single Python File');
	}

	private static async handleProjectUpload(): Promise<void> {
		// Step 1: Select Python file
		const pythonFiles = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'Python Files': ['py'],
				'All Files': ['*']
			},
			title: '📄 Select Main Python File'
		});

		if (!pythonFiles || pythonFiles.length === 0) {
			vscode.window.showInformationMessage('❌ No Python file selected.');
			return;
		}

		// Step 2: Select requirements.txt
		const reqFiles = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'Requirements Files': ['txt'],
				'Text Files': ['txt'],
				'All Files': ['*']
			},
			title: '📦 Select requirements.txt File'
		});

		if (!reqFiles || reqFiles.length === 0) {
			const useDefault = await vscode.window.showWarningMessage(
				'No requirements.txt selected. Use default requirements?',
				'Use Defaults',
				'Enter Manually',
				'Cancel'
			);
			
			if (useDefault === 'Cancel') return;
			
			if (useDefault === 'Enter Manually') {
				const manualReqs = await vscode.window.showInputBox({
					prompt: '📦 Enter Python packages (one per line)',
					placeHolder: 'numpy\npandas\nmatplotlib',
					ignoreFocusOut: true
				});
				
				if (!manualReqs) return;
				
				const pythonFile = pythonFiles[0];
				const fileContent = await vscode.workspace.fs.readFile(pythonFile);
				const code = Buffer.from(fileContent).toString('utf8');
				const fileName = pythonFile.path.split('/').pop() || 'uploaded.py';
				
				await CodeExecutor.executeUploadedFiles(code, fileName, manualReqs, 'Project Files');
				return;
			} else {
				const pythonFile = pythonFiles[0];
				const fileContent = await vscode.workspace.fs.readFile(pythonFile);
				const code = Buffer.from(fileContent).toString('utf8');
				const fileName = pythonFile.path.split('/').pop() || 'uploaded.py';
				
				await CodeExecutor.executeUploadedFiles(code, fileName, 'numpy\npandas\nmatplotlib\nrequests', 'Project Files (Default Requirements)');
				return;
			}
		}

		// Read both files
		const pythonFile = pythonFiles[0];
		const reqFile = reqFiles[0];
		
		const pythonContent = await vscode.workspace.fs.readFile(pythonFile);
		const reqContent = await vscode.workspace.fs.readFile(reqFile);
		
		const code = Buffer.from(pythonContent).toString('utf8');
		const requirements = Buffer.from(reqContent).toString('utf8');
		const fileName = pythonFile.path.split('/').pop() || 'uploaded.py';

		if (!code.trim()) {
			vscode.window.showErrorMessage('❌ The selected Python file is empty.');
			return;
		}

		await CodeExecutor.executeUploadedFiles(code, fileName, requirements, 'Project Files');
	}

	private static async handleCurrentFile(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('❌ No file is currently open. Please open a file first.');
			return;
		}
		
		const code = editor.document.getText();
		const fileName = editor.document.fileName.split('/').pop() || 'untitled.py';
		
		if (!code.trim()) {
			vscode.window.showErrorMessage('❌ No code found to execute. The file appears to be empty.');
			return;
		}

		// Get requirements
		const config = vscode.workspace.getConfiguration('resourcex');
		const defaultRequirements = config.get<string>('defaultRequirements') || 'numpy\npandas\nmatplotlib\nrequests';
		
		const requirements = await vscode.window.showInputBox({
			prompt: '📦 Enter Python packages needed (one per line)',
			value: defaultRequirements,
			placeHolder: 'numpy\npandas\nmatplotlib',
			ignoreFocusOut: true
		});

		if (requirements === undefined) return;

		await CodeExecutor.executeUploadedFiles(code, fileName, requirements || defaultRequirements, 'Current Editor File');
	}

	private static async handleSelectedCode(): Promise<void> {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showErrorMessage('❌ No file is currently open. Please open a file first.');
			return;
		}
		if (activeEditor.selection.isEmpty) {
			vscode.window.showErrorMessage('❌ No code selected. Please select some code to execute.');
			return;
		}
		
		const code = activeEditor.document.getText(activeEditor.selection);
		const fileName = 'selected_code.py';
		
		if (!code.trim()) {
			vscode.window.showErrorMessage('❌ No code found in selection.');
			return;
		}

		// Get requirements
		const config = vscode.workspace.getConfiguration('resourcex');
		const defaultRequirements = config.get<string>('defaultRequirements') || 'numpy\npandas\nmatplotlib\nrequests';
		
		const requirements = await vscode.window.showInputBox({
			prompt: '📦 Enter Python packages needed (one per line)',
			value: defaultRequirements,
			placeHolder: 'numpy\npandas\nmatplotlib',
			ignoreFocusOut: true
		});

		if (requirements === undefined) return;

		await CodeExecutor.executeUploadedFiles(code, fileName, requirements || defaultRequirements, 'Selected Code');
	}

	private static async executeUploadedFiles(code: string, fileName: string, requirements: string, uploadType: string): Promise<void> {
		// Show upload summary
		const reqList = requirements.split('\n').filter(r => r.trim()).length;
		
		const proceed = await vscode.window.showInformationMessage(
			`🚀 Ready to Execute ${uploadType}\n\n` +
			`📄 File: ${fileName}\n` +
			`📏 Code: ${code.length} characters\n` +
			`📦 Packages: ${reqList} requirements\n` +
			`🎯 Session: ${activeSessionId?.substr(-8)}\n\n` +
			`Proceed with execution?`,
			'👀 Preview First',
			'🚀 Execute Now',
			'❌ Cancel'
		);

		if (proceed === '❌ Cancel') return;

		if (proceed === '👀 Preview First') {
			// Show preview
			const previewDoc = await vscode.workspace.openTextDocument({
				content: [
					`# 🚀 ResourceX Execution Preview`,
					`# 📄 File: ${fileName}`,
					`# 📏 Length: ${code.length} characters`,
					`# 🎯 Session: ${activeSessionId?.substr(-8)}`,
					`# ⏰ Time: ${new Date().toLocaleString()}`,
					`# 📦 Requirements: ${reqList} packages`,
					'',
					'# Requirements:',
					requirements.split('\n').map(req => `# ${req}`).join('\n'),
					'',
					'# ' + '='.repeat(50),
					'# YOUR CODE BELOW:',
					'# ' + '='.repeat(50),
					'',
					code
				].join('\n'),
				language: 'python'
			});

			await vscode.window.showTextDocument(previewDoc, { 
				viewColumn: vscode.ViewColumn.Beside,
				preview: true 
			});

			const confirmChoice = await vscode.window.showWarningMessage(
				'🔍 Code preview opened. Proceed with execution?',
				'🚀 Yes, Execute',
				'❌ Cancel'
			);

			if (confirmChoice !== '🚀 Yes, Execute') return;
		}

		// Execute with enhanced progress tracking
		await CodeExecutor.executeWithProgress(code, fileName, requirements, uploadType);
	}

	private static async executeWithProgress(code: string, fileName: string, requirements: string, uploadType: string = 'Code'): Promise<void> {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `🚀 ResourceX: Executing ${uploadType}`,
			cancellable: false
		}, async (progress, token) => {
			try {
				// Phase 1: Upload and Security Analysis
				progress.report({ increment: 0, message: '📤 Uploading files for security analysis...' });

				const uploadResponse = await axios.post(`${getApiUrl()}/api/session/${activeSessionId}/upload`, {
					code,
					requirements,
					fileName: fileName
				}, {
					headers: AuthManager.getHeaders(),
					timeout: 30000
				});

				if (!uploadResponse.data.success) {
					throw new Error('Upload failed: ' + uploadResponse.data.message);
				}

				progress.report({ increment: 20, message: '🔒 Security analysis completed!' });

				// Show security analysis results
				if (uploadResponse.data.securityAnalysis) {
					const analysis = uploadResponse.data.securityAnalysis;
					const securityMessage = `🛡️ Security Analysis:\n` +
						`📊 Score: ${analysis.score}/100\n` +
						`⚖️ Risk Level: ${analysis.level}\n` +
						`✅ Verdict: ${analysis.verdict}`;
					
					console.log('Security Analysis:', securityMessage);
				}

				// Phase 2: Wait for execution
				progress.report({ increment: 20, message: '⏳ Waiting for device owner to execute...' });

				// Enhanced polling with better feedback
				let attempts = 0;
				const maxAttempts = 120; // 10 minutes with 5-second intervals
				let lastStatus = '';

				while (attempts < maxAttempts) {
					await new Promise(resolve => setTimeout(resolve, 5000));
					attempts++;

					const progressPercent = 40 + (attempts / maxAttempts) * 35;
					progress.report({ 
						increment: 0, 
						message: `⏳ Waiting for execution... (${attempts}/${maxAttempts}) - ${Math.floor(attempts * 5 / 60)}m ${(attempts * 5) % 60}s`
					});

					try {
						const resultResponse = await axios.get(`${getApiUrl()}/api/session/${activeSessionId}/result`, {
							headers: AuthManager.getHeaders(),
							timeout: 10000
						});

						if (resultResponse.data.success) {
							const status = resultResponse.data.executionStatus;
							
							// Show status changes
							if (status !== lastStatus) {
								lastStatus = status;
								progress.report({ 
									increment: 0, 
									message: `📈 Status: ${status}` 
								});
							}
							
							if (status === 'completed') {
								progress.report({ increment: 100, message: '✅ Execution completed successfully!' });
								await CodeExecutor.displayResults(resultResponse.data);
								return;
							} else if (status === 'failed') {
								progress.report({ increment: 100, message: '❌ Execution failed!' });
								await CodeExecutor.displayResults(resultResponse.data);
								return;
							} else if (status === 'rejected') {
								progress.report({ increment: 100, message: '🚫 Execution rejected!' });
								await CodeExecutor.displayResults(resultResponse.data);
								return;
							}
						}
					} catch (pollError) {
						console.warn('Polling error (will retry):', pollError);
					}
				}

				throw new Error('⏰ Execution timeout - no results received within 10 minutes. The device owner may need to manually execute your code.');

			} catch (error: any) {
				console.error('Execution error:', error);
				if (error.response?.status === 401) {
					await AuthManager.promptLogin();
				} else {
					vscode.window.showErrorMessage(
						'❌ Execution Error: ' + (error.response?.data?.message || error.message),
						'View Session Details'
					).then(selection => {
						if (selection === 'View Session Details') {
							vscode.commands.executeCommand('resourcex.viewSessions');
						}
					});
				}
			}
		});
	}

	static async displayResults(resultData: any): Promise<void> {
		const { result, executionStatus, securityAnalysis } = resultData;

		// Create a new document with results
		const resultContent = [
			'# ResourceX Execution Results',
			'',
			`**Status:** ${executionStatus}`,
			`**Timestamp:** ${new Date().toLocaleString()}`,
			`**Session ID:** ${activeSessionId?.substr(-8)}`,
			`**User:** ${currentUser?.name || 'Unknown'}`,
			'',
			'## Security Analysis',
			securityAnalysis ? [
				`**Score:** ${securityAnalysis.score}/100`,
				`**Risk Level:** ${securityAnalysis.level}`,
				`**Verdict:** ${securityAnalysis.verdict}`,
				`**Analyzed At:** ${new Date(securityAnalysis.analyzedAt).toLocaleString()}`,
			].join('\n') : 'No security analysis available',
			'',
			'## Execution Output',
			'```',
			result || 'No output',
			'```'
		].join('\n');

		const document = await vscode.workspace.openTextDocument({
			content: resultContent,
			language: 'markdown'
		});

		await vscode.window.showTextDocument(document);

		// Auto-save if configured
		const config = vscode.workspace.getConfiguration('resourcex');
		if (config.get<boolean>('autoSaveResults')) {
			const fileName = `resourcex-result-${Date.now()}.md`;
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			
			if (workspaceFolder) {
				const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
				await vscode.workspace.fs.writeFile(filePath, Buffer.from(resultContent));
				vscode.window.showInformationMessage(`Results saved to ${fileName}`);
			}
		}
	}

	static async getResults(): Promise<void> {
		if (!AuthManager.isUserAuthenticated()) {
			await AuthManager.promptLogin();
			return;
		}

		if (!activeSessionId) {
			vscode.window.showErrorMessage('Please select a session first');
			return;
		}

		try {
			const response = await axios.get(`${getApiUrl()}/api/session/${activeSessionId}/result`, {
				headers: AuthManager.getHeaders()
			});

			if (response.data.success) {
				await CodeExecutor.displayResults(response.data);
			} else {
				vscode.window.showErrorMessage('Failed to get results: ' + response.data.message);
			}
		} catch (error: any) {
			if (error.response?.status === 401) {
				await AuthManager.promptLogin();
			} else {
				vscode.window.showErrorMessage('Error getting results: ' + (error.response?.data?.message || error.message));
			}
		}
	}
}

// Security Analysis Viewer
class SecurityViewer {
	static async viewSecurityAnalysis(): Promise<void> {
		if (!AuthManager.isUserAuthenticated()) {
			await AuthManager.promptLogin();
			return;
		}

		try {
			const response = await axios.get(`${getApiUrl()}/api/session/security-analytics`, {
				headers: AuthManager.getHeaders()
			});

			if (response.data.success) {
				const analytics = response.data.analytics;
				
				const content = [
					'# ResourceX Security Analytics',
					'',
					`**User:** ${currentUser?.name || 'Unknown'}`,
					`**Analysis Period:** ${analytics.timeframe}`,
					`**Generated At:** ${new Date(analytics.generatedAt).toLocaleString()}`,
					'',
					'## Summary Statistics',
					`- **Total Analyzed:** ${analytics.summary.totalAnalyzed}`,
					`- **Average Score:** ${analytics.summary.averageScore.toFixed(2)}/100`,
					`- **High Risk:** ${analytics.summary.highRiskCount}`,
					`- **Medium Risk:** ${analytics.summary.mediumRiskCount}`,
					`- **Low Risk:** ${analytics.summary.lowRiskCount}`,
					`- **Rejected:** ${analytics.summary.rejectedCount}`,
					`- **Approved:** ${analytics.summary.approvedCount}`,
					'',
					'## Common Risk Factors',
					...analytics.riskFactors.map((rf: any) => `- **${rf.factor}:** ${rf.count} occurrences`),
					'',
					'## Score Distribution',
					...analytics.scoreDistribution.map((dist: any) => 
						`- **${dist._id}:** ${dist.count} sessions (avg: ${dist.averageScore?.toFixed(2) || 'N/A'})`
					)
				].join('\n');

				const document = await vscode.workspace.openTextDocument({
					content: content,
					language: 'markdown'
				});

				await vscode.window.showTextDocument(document);
			} else {
				vscode.window.showErrorMessage('Failed to get security analytics: ' + response.data.message);
			}
		} catch (error: any) {
			if (error.response?.status === 401) {
				await AuthManager.promptLogin();
			} else {
				vscode.window.showErrorMessage('Error getting security analytics: ' + (error.response?.data?.message || error.message));
			}
		}
	}
}

// Session Viewer
class SessionViewer {
	static async viewSessions(): Promise<void> {
		if (!AuthManager.isUserAuthenticated()) {
			await AuthManager.promptLogin();
			return;
		}

		await SessionManager.loadSessions();

		if (!sessions.length) {
			const result = await vscode.window.showInformationMessage(
				'No sessions found. Would you like to create your first session?',
				'Create Session',
				'Cancel'
			);
			
			if (result === 'Create Session') {
				await SessionManager.createSession();
			}
			return;
		}

		// Group sessions by status for better organization
		const activeSessions = sessions.filter(s => s.status === 'active');
		const requestedSessions = sessions.filter(s => s.status === 'requested');
		const completedSessions = sessions.filter(s => s.status === 'completed');
		const rejectedSessions = sessions.filter(s => s.status === 'rejected');

		const content = [
			'# My ResourceX Sessions',
			'',
			`**User:** ${currentUser?.name || 'Unknown'}`,
			`**Email:** ${currentUser?.email || 'Unknown'}`,
			`**Total Sessions:** ${sessions.length}`,
			`**Generated At:** ${new Date().toLocaleString()}`,
			'',
			'## Summary',
			`- 🟢 **Active Sessions:** ${activeSessions.length}`,
			`- 🟡 **Requested Sessions:** ${requestedSessions.length}`,
			`- 🔵 **Completed Sessions:** ${completedSessions.length}`,
			`- 🔴 **Rejected Sessions:** ${rejectedSessions.length}`,
			'',
			'---',
			''
		];

		// Helper function to format session details
		const formatSession = (session: any) => {
			const sessionId = session._id?.substr(-8) || 'unknown';
			const deviceName = session.device?.deviceName || 'Unknown Device';
			const deviceType = session.device?.deviceType || 'Unknown';
			const status = session.status || 'unknown';
			const executionStatus = session.executionStatus || 'not started';
			const language = session.language || 'python';
			const createdAt = session.createdAt ? new Date(session.createdAt).toLocaleString() : 'Unknown';
			const cost = session.cost ? `$${session.cost.toFixed(2)}` : 'Not calculated';

			let securityInfo = '';
			if (session.analysisResult) {
				securityInfo = [
					`- **Security Score:** ${session.analysisResult.securityScore || 'N/A'}/100`,
					`- **Security Level:** ${session.analysisResult.securityLevel || 'N/A'}`,
					`- **Security Verdict:** ${session.analysisResult.verdict || 'N/A'}`
				].join('\n');
			}

			return [
				`### 🔹 Session ${sessionId}`,
				`- **Device:** ${deviceName} (${deviceType})`,
				`- **Language:** ${language}`,
				`- **Status:** ${status}`,
				`- **Execution Status:** ${executionStatus}`,
				`- **Created:** ${createdAt}`,
				`- **Total Cost:** ${cost}`,
				securityInfo ? '- **Security Analysis:**' : '',
				securityInfo,
				''
			].filter(line => line !== '').join('\n');
		};

		// Add sections for each status
		if (activeSessions.length > 0) {
			content.push('## 🟢 Active Sessions');
			content.push('');
			activeSessions.forEach(session => content.push(formatSession(session)));
		}

		if (requestedSessions.length > 0) {
			content.push('## 🟡 Requested Sessions (Pending Owner Approval)');
			content.push('');
			requestedSessions.forEach(session => content.push(formatSession(session)));
		}

		if (completedSessions.length > 0) {
			content.push('## 🔵 Completed Sessions');
			content.push('');
			completedSessions.forEach(session => content.push(formatSession(session)));
		}

		if (rejectedSessions.length > 0) {
			content.push('## 🔴 Rejected Sessions');
			content.push('');
			rejectedSessions.forEach(session => content.push(formatSession(session)));
		}

		// Add helpful footer
		content.push('---');
		content.push('');
		content.push('## 💡 Quick Actions');
		content.push('- Use `ResourceX: Create Session` to rent a new device');
		content.push('- Use `ResourceX: Select Session` to choose an active session');
		content.push('- Use `ResourceX: Execute Code` to run code on your selected session');
		content.push('- Use `ResourceX: Get Results` to view execution results');

		const document = await vscode.workspace.openTextDocument({
			content: content.join('\n'),
			language: 'markdown'
		});

		await vscode.window.showTextDocument(document, {
			preview: true,
			viewColumn: vscode.ViewColumn.Beside
		});
	}
}

// Device Viewer
class DeviceViewer {
	static async viewAvailableDevices(): Promise<void> {
		if (!AuthManager.isUserAuthenticated()) {
			await AuthManager.promptLogin();
			return;
		}

		try {
			console.log('Fetching available devices from:', `${getApiUrl()}/api/device`);
			const response = await axios.get(`${getApiUrl()}/api/device`, {
				headers: AuthManager.getHeaders(),
				timeout: 15000
			});

			if (!Array.isArray(response.data)) {
				vscode.window.showErrorMessage('Failed to fetch device data');
				return;
			}

			const devices = response.data;
			const availableDevices = devices.filter((device: any) => device.isAvailable);

			if (devices.length === 0) {
				vscode.window.showInformationMessage('No devices found in the system.');
				return;
			}

			// Group devices by type and availability
			const availableByType: any = {};
			const unavailableByType: any = {};

			devices.forEach((device: any) => {
				const type = device.deviceType || 'Unknown';
				if (device.isAvailable) {
					if (!availableByType[type]) availableByType[type] = [];
					availableByType[type].push(device);
				} else {
					if (!unavailableByType[type]) unavailableByType[type] = [];
					unavailableByType[type].push(device);
				}
			});

			const content = [
				'# ResourceX Available Devices',
				'',
				`**Total Devices:** ${devices.length}`,
				`**Available Devices:** ${availableDevices.length}`,
				`**Unavailable Devices:** ${devices.length - availableDevices.length}`,
				`**Generated At:** ${new Date().toLocaleString()}`,
				'',
				'---',
				''
			];

			// Helper function to format device details
			const formatDevice = (device: any) => {
				const deviceName = device.deviceName || 'Unknown Device';
				const deviceType = device.deviceType || 'Unknown';
				const owner = device.owner?.name || 'Unknown Owner';
				const price = device.price ? `$${device.price}/hour` : 'Price not set';
				const performance = device.performance || 'Not rated';
				const location = device.location || 'Unknown location';
				const specs = device.specs ? 
					Object.entries(device.specs).map(([k, v]) => `${k}: ${v}`).join(', ') : 
					'No specs available';

				return [
					`### 🖥️ ${deviceName}`,
					`- **Type:** ${deviceType}`,
					`- **Owner:** ${owner}`,
					`- **Price:** ${price}`,
					`- **Performance Score:** ${performance}`,
					`- **Location:** ${location}`,
					`- **Specifications:** ${specs}`,
					''
				].join('\n');
			};

			// Add available devices sections
			if (Object.keys(availableByType).length > 0) {
				content.push('## 🟢 Available Devices');
				content.push('');
				
				Object.keys(availableByType).sort().forEach(type => {
					content.push(`### ${type} Devices (${availableByType[type].length} available)`);
					content.push('');
					availableByType[type].forEach((device: any) => {
						content.push(formatDevice(device));
					});
				});
			}

			// Add unavailable devices sections
			if (Object.keys(unavailableByType).length > 0) {
				content.push('---');
				content.push('');
				content.push('## 🔴 Unavailable Devices');
				content.push('');
				
				Object.keys(unavailableByType).sort().forEach(type => {
					content.push(`### ${type} Devices (${unavailableByType[type].length} unavailable)`);
					content.push('');
					unavailableByType[type].forEach((device: any) => {
						content.push(formatDevice(device));
					});
				});
			}

			// Add helpful footer
			content.push('---');
			content.push('');
			content.push('## 💡 Quick Actions');
			content.push('- Use `ResourceX: Create Session` to rent an available device');
			content.push('- Use `ResourceX: View Sessions` to see your current sessions');
			content.push('- Device owners can manage their devices through the ResourceX web interface');

			const document = await vscode.workspace.openTextDocument({
				content: content.join('\n'),
				language: 'markdown'
			});

			await vscode.window.showTextDocument(document, {
				preview: true,
				viewColumn: vscode.ViewColumn.Beside
			});

		} catch (error: any) {
			console.error('Error fetching devices:', error);
			if (error.response?.status === 401) {
				await AuthManager.promptLogin();
			} else if (error.code === 'ECONNREFUSED') {
				vscode.window.showErrorMessage('Cannot connect to ResourceX server. Is it running?');
			} else {
				const errorMsg = error.response?.data?.message || error.message || 'Unknown error occurred';
				vscode.window.showErrorMessage('Error fetching devices: ' + errorMsg);
			}
		}
	}
}

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	console.log('ResourceX extension is now active!');

	// Initialize AuthManager with context
	AuthManager.initialize(context);

	// Check authentication on startup
	AuthManager.checkAuth().then(authenticated => {
		if (authenticated) {
			vscode.window.showInformationMessage(`✅ ResourceX: Welcome back, ${currentUser.name}!`);
		} else {
			// Don't show auth prompt immediately on startup, let user initiate
			console.log('ResourceX: Not authenticated. User can authenticate when needed.');
		}
	});

	// Register commands with better names and descriptions
	const commands = [
		vscode.commands.registerCommand('resourcex.checkAuth', async () => {
			const authenticated = await AuthManager.checkAuth();
			if (authenticated) {
				vscode.window.showInformationMessage(
					`✅ Authenticated as: ${currentUser.name} (${currentUser.email})`,
					'View Profile'
				).then(selection => {
					if (selection === 'View Profile') {
						vscode.window.showInformationMessage(
							`Name: ${currentUser.name}\nEmail: ${currentUser.email}\nVerified: ${currentUser.isVerified ? 'Yes' : 'No'}`
						);
					}
				});
			} else {
				await AuthManager.promptLogin();
			}
		}),
		
		vscode.commands.registerCommand('resourcex.login', async () => {
			await AuthManager.promptLogin();
		}),
		
		vscode.commands.registerCommand('resourcex.enterToken', async () => {
			await AuthManager.authenticateWithToken();
		}),
		
		vscode.commands.registerCommand('resourcex.logout', async () => {
			await AuthManager.clearAuthState();
			vscode.window.showInformationMessage('✅ Logged out successfully');
		}),
		
		vscode.commands.registerCommand('resourcex.openLogin', async () => {
			const frontendUrl = getApiUrl().replace(':5002', ':5173');
			await vscode.env.openExternal(vscode.Uri.parse(frontendUrl));
			
			setTimeout(() => {
				vscode.window.showInformationMessage(
					'After logging in, use "ResourceX: Enter Auth Token" to authenticate this extension',
					'How to get token'
				).then(selection => {
					if (selection === 'How to get token') {
						AuthManager.showTokenExtractionInstructions();
					}
				});
			}, 2000);
		}),
		
		vscode.commands.registerCommand('resourcex.tokenInstructions', () => {
			AuthManager.showTokenExtractionInstructions();
		}),
		
		vscode.commands.registerCommand('resourcex.executeCode', CodeExecutor.executeCode),
		vscode.commands.registerCommand('resourcex.createSession', SessionManager.createSession),
		vscode.commands.registerCommand('resourcex.selectSession', SessionManager.selectSession),
		vscode.commands.registerCommand('resourcex.getResults', CodeExecutor.getResults),
		vscode.commands.registerCommand('resourcex.viewSessions', SessionViewer.viewSessions),
		vscode.commands.registerCommand('resourcex.securityAnalysis', SecurityViewer.viewSecurityAnalysis),
		vscode.commands.registerCommand('resourcex.viewAvailableDevices', DeviceViewer.viewAvailableDevices)
	];

	// Add all disposables to context
	commands.forEach(command => context.subscriptions.push(command));
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('ResourceX extension is now deactivated');
}