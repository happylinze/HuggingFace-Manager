import logging
import os
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class DataViewer:
    """
    Helper class to preview dataset contents without full download.
    Uses 'pyarrow' and 'huggingface_hub' filesystem.
    """
    
    @staticmethod
    def get_preview(repo_id: str, revision: str = "main", rows: int = 50) -> Dict[str, Any]:
        """
        Reads the first parquet file found in the dataset and returns the first N rows.
        """
        try:
            # Lazy import to avoid hard dependency overhead
            import pyarrow.parquet as pq
            from huggingface_hub import HfFileSystem
            import fs as fsspec_fs # underlying fs might raise errors
        except ImportError as e:
            logger.error(f"Missing dependency for data preview: {e}")
            return {
                "error": "Missing dependency: pyarrow. Please install it manually.",
                "dependency_missing": True
            }

        try:
            hfs = HfFileSystem(revision=revision)
            # Look for parquet files in the root or data/ directory
            # We'll try a generic glob for any parquet file
            path = f"datasets/{repo_id}"
            files = hfs.glob(f"{path}/**/*.parquet")
            
            if not files:
                 # Fallback: check for jsonl or csv? Phase 10 spec focused on Parquet/Viewer
                 return {"error": "No .parquet files found in this dataset."}
            
            # Pick the first file (usually the first split)
            target_file = files[0]
            logger.info(f"Previewing file: {target_file}")

            # Open the file using HfFileSystem (streaming)
            with hfs.open(target_file, "rb") as f:
                # Read parquet file
                parquet_file = pq.ParquetFile(f)
                # Read first 'rows' rows
                # iter_batches is efficient for streaming
                for batch in parquet_file.iter_batches(batch_size=rows):
                    df = batch.to_pandas()
                    # Convert to JSON-compatible dict
                    # 'split' orientation: {columns: [], data: [[], []]} is compact
                    # 'records': [{col: val}, ...] is easier for frontend grids often
                    # Let's use 'records' for simplicity in Frontend Table mapping, 
                    # or 'split' if we want header separate. 'split' is usually cleaner.
                    data = df.head(rows).to_dict(orient="split")
                    
                    return {
                        "file": target_file.replace(f"datasets/{repo_id}/", ""),
                        "columns": data.get("columns", []),
                        "rows": data.get("data", []),
                        "total_rows_in_file": parquet_file.metadata.num_rows,
                        "success": True
                    }
                    
            return {"error": "Could not read data from file."}

        except Exception as e:
            logger.exception("Error generating dataset preview")
            return {"error": str(e)}
