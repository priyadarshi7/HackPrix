import groq
from fastapi import FastAPI, Body, HTTPException, Request, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Union
from rich.console import Console
from rich.markdown import Markdown
import os
import glob
from pathlib import Path
import json
import shutil
import uuid
from dotenv import load_dotenv

load_dotenv()

# Set up console for better formatting
console = Console()
app = FastAPI(title="Code Assistant API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    
class ChatResponse(BaseModel):
    response: str
    tool_calls: List[Dict[str, Any]] = []
    session_id: str
    context: Dict[str, Any] = {}
    
class WorkspaceInfo(BaseModel):
    current_directory: str
    available_files: List[str]
    directories: List[str]
    
class UploadResponse(BaseModel):
    success: bool
    message: str
    file_path: Optional[str] = None
    size: Optional[int] = None
    session_id: Optional[str] = None

# Global storage for session data
sessions = {}

# Set up workspace directory
WORKSPACE_ROOT = os.path.join(os.getcwd(), "workspace")
os.makedirs(WORKSPACE_ROOT, exist_ok=True)

# Session management
def get_or_create_session(session_id: Optional[str] = None):
    """Get existing session or create a new one"""
    if not session_id:
        session_id = str(uuid.uuid4())
    
    if session_id not in sessions:
        # Create a session-specific workspace folder
        session_workspace = os.path.join(WORKSPACE_ROOT, session_id)
        os.makedirs(session_workspace, exist_ok=True)
        
        sessions[session_id] = {
            "messages": [],
            "context": {
                "current_directory": session_workspace,
                "workspace_root": session_workspace
            }
        }
    
    return session_id, sessions[session_id]

# Tool definitions
class Tools:
    @staticmethod
    def read_file(file_path, session_workspace=None):
        """Read content from a file."""
        try:
            # Make sure the path is within the workspace
            if session_workspace and not os.path.isabs(file_path):
                file_path = os.path.join(session_workspace, file_path)
            elif session_workspace:
                abs_path = os.path.abspath(file_path)
                if not abs_path.startswith(session_workspace):
                    file_path = os.path.join(session_workspace, os.path.basename(file_path))
                
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
            return {"success": True, "content": content, "file_path": file_path}
        except Exception as e:
            return {"success": False, "error": f"Error reading file: {str(e)}"}
            
    @staticmethod
    def write_file(file_path, content, session_workspace=None):
        """Write content to a file."""
        try:
            # Make sure the path is within the workspace
            if session_workspace and not os.path.isabs(file_path):
                file_path = os.path.join(session_workspace, file_path)
            elif session_workspace:
                abs_path = os.path.abspath(file_path)
                if not abs_path.startswith(session_workspace):
                    file_path = os.path.join(session_workspace, os.path.basename(file_path))
            
            # Ensure the directory exists
            os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
            
            with open(file_path, 'w', encoding='utf-8') as file:
                file.write(content)
            return {"success": True, "message": f"Successfully wrote to {file_path}", "file_path": file_path}
        except Exception as e:
            return {"success": False, "error": f"Error writing to file: {str(e)}"}
    
    @staticmethod
    def list_directory(directory=".", session_workspace=None):
        """List files in the specified directory."""
        try:
            # Make sure the directory is within workspace
            if session_workspace and directory == ".":
                directory = session_workspace
            elif session_workspace and not os.path.isabs(directory):
                directory = os.path.join(session_workspace, directory)
            elif session_workspace:
                abs_path = os.path.abspath(directory)
                if not abs_path.startswith(session_workspace):
                    directory = session_workspace
            
            if not os.path.exists(directory):
                return {"success": False, "error": f"Directory does not exist: {directory}"}
            
            items = os.listdir(directory)
            directories = []
            files = []
            
            for item in items:
                item_path = os.path.join(directory, item)
                if os.path.isdir(item_path):
                    directories.append(item)
                else:
                    files.append(item)
            
            return {
                "success": True, 
                "directories": directories,
                "files": files,
                "current_path": os.path.abspath(directory)
            }
        except Exception as e:
            return {"success": False, "error": f"Error listing directory: {str(e)}"}

class CodeAssistant:
    def __init__(self, api_key):
        """Initialize the assistant with Groq API credentials."""
        if not api_key:
            raise ValueError("Groq API key is required")
        self.client = groq.Client(api_key=api_key)
        self.model = "llama3-70b-8192"
        
    def analyze_code(self, code):
        """Analyze code and provide detailed explanation."""
        prompt = f"""As an expert code reviewer, please analyze the following code and provide:
        
1. A high-level summary of what the code does
2. Breakdown of major components and how they interact
3. Key functions/classes and their purposes
4. Potential issues or areas for improvement
5. Best practices that are followed or could be implemented

```
{code}
```

Format your response using Markdown for readability."""
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
                max_tokens=4096
            )
            return {"success": True, "analysis": response.choices[0].message.content}
        except Exception as e:
            return {"success": False, "error": f"Error analyzing code: {str(e)}"}
    
    def modify_code(self, code, instructions, file_path=None):
        """Modify code based on instructions."""
        file_context = f"This code is from file: {file_path}\n\n" if file_path else ""
        
        prompt = f"""{file_context}Please modify the following code according to these instructions: 
        
{instructions}

Original code:
```
{code}
```

Return your response in the following format:
1. First provide ONLY the complete modified code (not a diff, but the entire new version) without any additional text or explanation
2. Then, after the code block, explain the key changes you made and how they address the instructions

Be precise and maintain the style and structure of the original code where possible."""
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=8192
            )
            return {"success": True, "result": response.choices[0].message.content}
        except Exception as e:
            return {"success": False, "error": f"Error modifying code: {str(e)}"}
    
    def chat(self, messages, tools_info=None):
        """Process chat messages with or without tool context."""
        system_message = """You are a helpful Code Assistant that can analyze and modify code.
        You have access to the following tools to help users work with their code:
        
        - read_file: Read the content of a file
        - write_file: Write content to a file  
        - list_directory: List files in a directory
        - analyze_code: Analyze the structure and functionality of code
        - modify_code: Make changes to code based on specific instructions
        
        When working with code files, help users understand their code and suggest improvements.
        When a user asks to modify code, first understand what they want to change and then use the modify_code tool.
        Always respond in Markdown format for readability.
        
        After performing tool operations, summarize what you did and what you found.
        """
        
        # Add tool context if available
        if tools_info:
            system_message += f"\n\nCurrent workspace information:\n{json.dumps(tools_info, indent=2)}"
        
        try:
            all_messages = [{"role": "system", "content": system_message}] + messages
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=all_messages,
                temperature=0.7,
                max_tokens=4096,
                tools=[
                    {
                        "type": "function",
                        "function": {
                            "name": "read_file",
                            "description": "Read the content of a file",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "file_path": {
                                        "type": "string",
                                        "description": "Path to the file to read"
                                    }
                                },
                                "required": ["file_path"]
                            }
                        }
                    },
                    {
                        "type": "function",
                        "function": {
                            "name": "write_file",
                            "description": "Write content to a file",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "file_path": {
                                        "type": "string",
                                        "description": "Path to the file to write to"
                                    },
                                    "content": {
                                        "type": "string",
                                        "description": "Content to write to the file"
                                    }
                                },
                                "required": ["file_path", "content"]
                            }
                        }
                    },
                    {
                        "type": "function",
                        "function": {
                            "name": "list_directory",
                            "description": "List files in a directory",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "directory": {
                                        "type": "string",
                                        "description": "Directory path to list files from (optional, defaults to current directory)"
                                    }
                                },
                                "required": []
                            }
                        }
                    },
                    {
                        "type": "function",
                        "function": {
                            "name": "analyze_code",
                            "description": "Analyze code structure and functionality",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "code": {
                                        "type": "string",
                                        "description": "Code to analyze"
                                    }
                                },
                                "required": ["code"]
                            }
                        }
                    },
                    {
                        "type": "function",
                        "function": {
                            "name": "modify_code",
                            "description": "Modify code based on instructions",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "code": {
                                        "type": "string",
                                        "description": "Original code to modify"
                                    },
                                    "instructions": {
                                        "type": "string",
                                        "description": "Instructions for code modification"
                                    },
                                    "file_path": {
                                        "type": "string",
                                        "description": "Path to the file (for context)"
                                    }
                                },
                                "required": ["code", "instructions"]
                            }
                        }
                    }
                ],
                tool_choice="auto"
            )
            
            return {
                "success": True, 
                "response": response.choices[0].message.content or "",
                "tool_calls": response.choices[0].message.tool_calls if hasattr(response.choices[0].message, 'tool_calls') and response.choices[0].message.tool_calls else []
            }
        except Exception as e:
            return {"success": False, "error": f"Error in chat: {str(e)}"}

# Initialize the assistant with API key from environment
try:
    groq_api_key = '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'
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set")
    assistant = CodeAssistant(api_key=groq_api_key)
except Exception as e:
    print(f"Failed to initialize Code Assistant: {e}")
    assistant = None

# API Routes
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Main endpoint for chat interactions with tool functionality."""
    if not assistant:
        raise HTTPException(status_code=500, detail="Code Assistant not properly initialized. Check your GROQ_API_KEY environment variable.")
    
    try:
        session_id, session = get_or_create_session(request.session_id)
        
        # Add user message to history
        session["messages"].append({"role": "user", "content": request.message})
        
        # Get workspace info for context
        workspace_info = Tools.list_directory(
            session["context"].get("current_directory", WORKSPACE_ROOT),
            session["context"].get("workspace_root")
        )
        
        # Process the message
        chat_result = assistant.chat(session["messages"], workspace_info)
        
        if not chat_result["success"]:
            raise HTTPException(status_code=500, detail=chat_result["error"])
        
        # Process any tool calls
        tool_calls_results = []
        
        if chat_result.get("tool_calls"):
            for call in chat_result["tool_calls"]:
                function_name = call.function.name
                try:
                    arguments = json.loads(call.function.arguments)
                except json.JSONDecodeError as e:
                    arguments = {}
                    print(f"Error parsing tool arguments: {e}")
                
                # Execute the appropriate tool
                if function_name == "read_file":
                    result = Tools.read_file(
                        arguments.get("file_path", ""),
                        session["context"].get("workspace_root")
                    )
                    # Update file content in context
                    if result["success"]:
                        session["context"]["last_read_file"] = arguments["file_path"]
                        session["context"]["last_file_content"] = result["content"]
                
                elif function_name == "write_file":
                    result = Tools.write_file(
                        arguments.get("file_path", ""),
                        arguments.get("content", ""),
                        session["context"].get("workspace_root")
                    )
                    if result["success"]:
                        session["context"]["last_modified_file"] = arguments["file_path"]
                
                elif function_name == "list_directory":
                    directory = arguments.get("directory", ".")
                    result = Tools.list_directory(
                        directory,
                        session["context"].get("workspace_root")
                    )
                    if result["success"]:
                        session["context"]["current_directory"] = result["current_path"]
                
                elif function_name == "analyze_code":
                    result = assistant.analyze_code(arguments.get("code", ""))
                    if result["success"]:
                        session["context"]["last_analysis"] = result["analysis"]
                
                elif function_name == "modify_code":
                    result = assistant.modify_code(
                        arguments.get("code", ""), 
                        arguments.get("instructions", ""),
                        arguments.get("file_path")
                    )
                    if result["success"]:
                        session["context"]["last_modified_code"] = result["result"]
                
                else:
                    result = {"success": False, "error": f"Unknown tool: {function_name}"}
                
                # Add result to the list
                tool_calls_results.append({
                    "tool": function_name,
                    "arguments": arguments,
                    "result": result
                })
                
                # Add tool response to the conversation
                tool_message = {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "name": function_name,
                    "content": json.dumps(result)
                }
                session["messages"].append(tool_message)
        
        # Get final response with tool results incorporated
        if tool_calls_results:
            # Get a final response that takes into account the tool results
            final_result = assistant.chat(session["messages"], workspace_info)
            if not final_result["success"]:
                raise HTTPException(status_code=500, detail=final_result["error"])
            response_content = final_result["response"]
        else:
            response_content = chat_result["response"]
        
        # Add assistant response to history
        session["messages"].append({"role": "assistant", "content": response_content})
        
        # Return the response
        return ChatResponse(
            response=response_content,
            tool_calls=tool_calls_results,
            session_id=session_id,
            context=session["context"]
        )
    
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/workspace/{session_id}", response_model=WorkspaceInfo)
async def get_workspace_info(session_id: str, directory: Optional[str] = None):
    """Get information about the current workspace."""
    # Get or create the session
    session_id, session = get_or_create_session(session_id)
    
    # Get the directory to list
    if not directory:
        directory = session["context"].get("current_directory")
    
    # List the directory
    result = Tools.list_directory(directory, session["context"].get("workspace_root"))
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["error"])
    
    return WorkspaceInfo(
        current_directory=result["current_path"],
        available_files=result["files"],
        directories=result["directories"]
    )

# File upload endpoints
@app.post("/upload/file/{session_id}", response_model=UploadResponse)
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    path: Optional[str] = Form(None)
):
    """Upload a single file to the workspace."""
    # Get or create the session
    session_id, session = get_or_create_session(session_id)
    session_workspace = session["context"].get("workspace_root")
    
    try:
        # Determine the destination path
        if not path:
            destination = os.path.join(session_workspace, file.filename)
        else:
            # Make sure path is within workspace
            abs_path = os.path.abspath(path)
            if not abs_path.startswith(session_workspace):
                path = os.path.join(session_workspace, path)
                
            if os.path.isdir(path):
                destination = os.path.join(path, file.filename)
            else:
                destination = path
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(os.path.abspath(destination)), exist_ok=True)
        
        # Save the file
        contents = await file.read()
        with open(destination, "wb") as f:
            f.write(contents)
        
        # Update session context
        relative_path = os.path.relpath(destination, session_workspace)
        session["context"]["last_uploaded_file"] = relative_path
        
        return UploadResponse(
            success=True,
            message=f"File uploaded successfully",
            file_path=destination,
            size=len(contents),
            session_id=session_id
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/upload/files/{session_id}", response_model=List[UploadResponse])
async def upload_multiple_files(
    session_id: str,
    files: List[UploadFile] = File(...),
    directory: Optional[str] = Form(None)
):
    """Upload multiple files, maintaining folder structure."""
    # Get or create the session
    session_id, session = get_or_create_session(session_id)
    session_workspace = session["context"].get("workspace_root")
    
    # Determine target directory
    if directory:
        target_dir = os.path.join(session_workspace, directory)
    else:
        target_dir = session_workspace
    
    # Create target directory if it doesn't exist
    os.makedirs(target_dir, exist_ok=True)
    
    results = []
    for file in files:
        try:
            # Extract path info from filename if it contains path separators
            filepath = file.filename.replace('\\', '/')
            
            # Determine destination path
            destination = os.path.join(target_dir, filepath)
            
            # Ensure parent directory exists
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            
            # Save the file
            contents = await file.read()
            with open(destination, "wb") as f:
                f.write(contents)
            
            results.append(UploadResponse(
                success=True,
                message=f"File uploaded successfully",
                file_path=destination,
                size=len(contents),
                session_id=session_id
            ))
        
        except Exception as e:
            results.append(UploadResponse(
                success=False,
                message=f"Failed to upload {file.filename}: {str(e)}",
                session_id=session_id
            ))
    
    # Update session context with all uploaded files
    session["context"]["uploaded_files"] = [r.file_path for r in results if r.success]
    
    return results

@app.post("/create/folder/{session_id}")
async def create_folder(
    session_id: str,
    path: str = Form(...)
):
    """Create a new folder in the workspace."""
    # Get or create the session
    session_id, session = get_or_create_session(session_id)
    session_workspace = session["context"].get("workspace_root")
    
    try:
        # Make sure path is within workspace
        abs_path = os.path.abspath(path)
        if not abs_path.startswith(session_workspace):
            folder_path = os.path.join(session_workspace, path)
        else:
            folder_path = path
        
        # Create the folder
        os.makedirs(folder_path, exist_ok=True)
        
        # Update session context
        session["context"]["last_created_folder"] = folder_path
        
        return {
            "success": True,
            "message": f"Folder created successfully at {folder_path}",
            "path": folder_path
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create folder: {str(e)}")

@app.delete("/workspace/{session_id}/{file_path:path}")
async def delete_file_or_folder(session_id: str, file_path: str):
    """Delete a file or directory from the workspace."""
    # Get or create the session
    session_id, session = get_or_create_session(session_id)
    session_workspace = session["context"].get("workspace_root")
    
    # Make sure the file path starts within workspace
    abs_path = os.path.abspath(file_path)
    if not abs_path.startswith(session_workspace):
        file_path = os.path.join(session_workspace, file_path)
    
    try:
        # Check if it's a file or directory
        if os.path.isfile(file_path):
            os.remove(file_path)
            message = f"File '{os.path.basename(file_path)}' deleted successfully"
        elif os.path.isdir(file_path):
            shutil.rmtree(file_path)
            message = f"Directory '{os.path.basename(file_path)}' deleted successfully"
        else:
            raise HTTPException(status_code=404, detail=f"Path not found: {file_path}")
        
        # Update session context
        session["context"]["last_deleted_path"] = file_path
        
        return {"success": True, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting path: {str(e)}")

@app.get("/sessions/{session_id}")
async def get_session_info(session_id: str):
    """Get information about a session."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    return {
        "session_id": session_id,
        "context": sessions[session_id]["context"],
        "message_count": len(sessions[session_id]["messages"])
    }

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "assistant_initialized": assistant is not None,
        "workspace_root": WORKSPACE_ROOT
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)  # Changed to port 8000