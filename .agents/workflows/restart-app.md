---
description: How to restart the City of Agents application (Backend and Frontend)
---

To restart the application, you need to run two separate commands in different terminals.

### 1. Restart Backend
From the project root directory:
```bash
make backend
```
*Note: This runs `uv run uvicorn api.main:app --reload --port 8000`. The `--reload` flag means the server will automatically restart whenever you modify backend files.*

### 2. Restart Frontend
Navigate to the UI directory and run the dev server:
```bash
cd city_of_agents_ui && npm run dev
```

### 3. Full Cleanup (If needed)
If you encounter dependency issues, you can run:
```bash
# In root
uv sync

# In city_of_agents_ui
npm install
```
