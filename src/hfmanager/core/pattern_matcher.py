import fnmatch
from typing import List, Optional

def match_patterns(filename: str, include_patterns: Optional[List[str]] = None, exclude_patterns: Optional[List[str]] = None) -> bool:
    """
    Check if a filename matches the include and exclude patterns.
    
    Args:
        filename: The filename to check.
        include_patterns: List of glob patterns to include. If None/Empty, all files are included (unless excluded).
        exclude_patterns: List of glob patterns to exclude.
        
    Returns:
        True if the file should be included, False otherwise.
    """
    # 1. Check Include Patterns
    # If include patterns are specified, file MUST match at least one
    if include_patterns:
        matched_include = False
        for pattern in include_patterns:
            if fnmatch.fnmatch(filename, pattern):
                matched_include = True
                break
        if not matched_include:
            return False
            
    # 2. Check Exclude Patterns
    # If file matches any exclude pattern, it is rejected
    if exclude_patterns:
        for pattern in exclude_patterns:
            if fnmatch.fnmatch(filename, pattern):
                return False
                
    return True
