
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, List
from ...core.plugin_manager import PluginManager, QUANTIZATION_TYPES
from ...core.converter import GGUFConverter
from ...core.downloader import HFDownloader
from ..dependencies import get_plugin_manager, get_downloader
import os

router = APIRouter(prefix="/plugins", tags=["Plugins"])

class PluginStatusResponse(BaseModel):
    id: str
    name: str
    status: str
    version: str = ""
    description: str = ""

@router.get("/", response_model=List[PluginStatusResponse])
def list_plugins(pm: PluginManager = Depends(get_plugin_manager)):
    """List all available plugins and their status."""
    results = []
    for pid, info in pm.PLUGINS.items():
        status = pm.get_plugin_status(pid)
        results.append(PluginStatusResponse(
            id=pid,
            name=info["name"],
            description=info["description"],
            status=status["status"],
            version=status.get("version", "")
        ))
    return results

@router.post("/{plugin_id}/install")
def install_plugin(
    plugin_id: str, 
    background_tasks: BackgroundTasks, 
    pm: PluginManager = Depends(get_plugin_manager)
):
    """Install a plugin in background."""
    if plugin_id not in pm.PLUGINS:
        raise HTTPException(status_code=404, detail="Plugin not found")
        
    # We run this in background
    def _install_task():
        try:
            pm.install_plugin(plugin_id)
        except Exception as e:
            print(f"Failed to install plugin {plugin_id}: {e}")

    background_tasks.add_task(_install_task)
    return {"success": True, "message": f"Installation of {plugin_id} started"}

@router.delete("/{plugin_id}")
def uninstall_plugin(
    plugin_id: str,
    pm: PluginManager = Depends(get_plugin_manager)
):
    """Uninstall a plugin."""
    try:
        pm.uninstall_plugin(plugin_id)
        return {"success": True, "message": f"Plugin {plugin_id} uninstalled"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Tool Execution ---

class GGUFConvertRequest(BaseModel):
    repo_id: str = "local" # 'local' for arbitrary files
    input_path: str
    output_path: str
    quantization: str = "Q4_K_M"

@router.post("/tools/gguf/convert")
def convert_gguf(
    request: GGUFConvertRequest,
    pm: PluginManager = Depends(get_plugin_manager),
    downloader: HFDownloader = Depends(get_downloader)
):
    """
    Execute GGUF conversion (Quantization).
    """
    converter = GGUFConverter(downloader, pm)
    try:
        task_id = converter.run_conversion(
            repo_id=request.repo_id,
            input_path=request.input_path,
            output_path=request.output_path,
            quantization=request.quantization
        )
        return {"success": True, "task_id": task_id}
    except ValueError as e:
         raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@router.get("/tools/gguf/types")
def get_quantization_types():
    return QUANTIZATION_TYPES
