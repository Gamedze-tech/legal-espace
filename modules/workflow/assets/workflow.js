// Prevent double-loading
if (window.__WORKFLOW_JS_LOADED__) {
    console.warn('workflow.js already loaded, skipping duplicate execution.');
} else {
    window.__WORKFLOW_JS_LOADED__ = true;

    const WF_COLORS = {
        not_started: '#6b7280',
        in_progress: '#2563eb',
        waiting: '#f59e0b',
        completed: '#16a34a',
        skipped: '#374151',
        cancelled: '#dc2626'
    };

    function wfGetRoot() {
        return document.getElementById('workflowRoot');
    }

    async function wfEnsure() {
        const root = wfGetRoot();
        if (!root) {
            alert('Workflow container not found.');
            return;
        }

        const fileId = root.dataset.fileId;
        if (!fileId) {
            alert('Missing file id on workflow container.');
            return;
        }

        try {
            const payload = new URLSearchParams({
                action: 'ensure_workflow',
                file_id: String(fileId)
            });

            const res = await fetch('modules/workflow/api/workflow_actions.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: payload.toString()
            });

            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                console.error('wfEnsure non-JSON response:', text);
                alert('Server returned invalid response while initiating workflow.');
                return;
            }

            if (!json.success) {
                alert(json.message || 'Failed to initiate workflow.');
                return;
            }

            await wfLoadTimeline();
        } catch (err) {
            console.error('wfEnsure error:', err);
            alert('Failed to initiate workflow.');
        }
    }

    async function wfLoadTimeline() {
        const root = wfGetRoot();
        const wrap = document.getElementById('wfTimeline');
        if (!root || !wrap) return;

        const fileId = root.dataset.fileId;
        if (!fileId) {
            wrap.innerHTML = '<div class="wf-card">Missing file id.</div>';
            return;
        }

        try {
            const res = await fetch(`modules/workflow/api/workflow_actions.php?action=timeline&file_id=${encodeURIComponent(fileId)}`);
            const text = await res.text();

            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                console.error('wfLoadTimeline non-JSON response:', text);
                wrap.innerHTML = '<div class="wf-card">Invalid server response.</div>';
                return;
            }

            if (!json.success) {
                wrap.innerHTML = `<div class="wf-card">${json.message || 'Failed to load workflow timeline.'}</div>`;
                return;
            }

            const stages = Array.isArray(json.stages) ? json.stages : [];

            if (stages.length === 0) {
                wrap.innerHTML = `
                    <div class="wf-card">
                        No workflow exists for this file yet.
                        Click <strong>Initiate Workflow</strong> to create one.
                    </div>
                    <div id="wfStagePanel"></div>
                `;
                return;
            }

            wrap.innerHTML = `
                <div class="wf-line">
                    ${stages.map((s, i) => `
                        <div class="wf-node-wrap">
                            <button
                                type="button"
                                class="wf-node"
                                style="border-color:${WF_COLORS[s.status_code] || '#6b7280'}"
                                onclick="wfOpenStage(${Number(s.id)})"
                            >${i + 1}</button>
                            <div class="wf-label">${escapeHtml(s.stage_name ?? '')}</div>
                            <div class="wf-sub">
                                ${escapeHtml(String(s.status_code ?? '').replaceAll('_', ' '))} • ${Number(s.progress_percent ?? 0).toFixed(0)}%
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div id="wfStagePanel"></div>
            `;
        } catch (err) {
            console.error('wfLoadTimeline error:', err);
            wrap.innerHTML = '<div class="wf-card">Failed to load workflow timeline.</div>';
        }
    }

    async function wfOpenStage(stageId) {
        const panel = document.getElementById('wfStagePanel');
        if (!panel) return;

        try {
            const res = await fetch(`modules/workflow/api/workflow_actions.php?action=stage_details&stage_id=${encodeURIComponent(stageId)}`);
            const text = await res.text();

            let j;
            try {
                j = JSON.parse(text);
            } catch (e) {
                console.error('wfOpenStage non-JSON response:', text);
                panel.innerHTML = '<div class="wf-card">Invalid stage details response.</div>';
                return;
            }

            if (!j.success) {
                panel.innerHTML = `<div class="wf-card">${j.message || 'Failed to load stage details.'}</div>`;
                return;
            }

            const tasks = Array.isArray(j.tasks) ? j.tasks : [];

            // Fetch documents separately
            let docs = [];
            try {
                const docRes = await fetch(`modules/workflow/api/workflow_actions.php?action=get_documents&stage_id=${encodeURIComponent(stageId)}`);
                const docText = await docRes.text();
                const docJ = JSON.parse(docText);
                if (docJ.success && Array.isArray(docJ.documents)) {
                    docs = docJ.documents;
                }
            } catch (e) {
                console.error('Failed to fetch documents:', e);
            }

            panel.innerHTML = `
                <div class="wf-stage-panel">
                    <h4>${escapeHtml(j.stage?.stage_name ?? 'Stage')}</h4>
                    <p>Status: ${escapeHtml(j.stage?.status_code ?? 'unknown')} | Progress: ${Number(j.stage?.progress_percent ?? 0).toFixed(0)}%</p>

                    <div class="wf-stage-section">
                        <h5 style="margin-top:16px; color:#e2e8f0; border-bottom:1px solid #334155; padding-bottom:8px;">Tasks</h5>
                        <div class="wf-task-list">
                            ${tasks.length === 0 ? '<div class="wf-card">No tasks for this stage yet.</div>' : tasks.map(t => `
                                <div class="wf-task-item">
                                    <span>${escapeHtml(t.task_name ?? '')} ${Number(t.is_mandatory) === 1 ? '<b style="color:#ef4444;">*</b>' : ''}</span>
                                    <select onchange="wfUpdateTaskStatus(${Number(t.id)}, this.value)" style="padding:4px 8px; border-radius:4px; border:1px solid #334155; background:#111827; color:#e2e8f0;">
                                        ${['not_started','in_progress','waiting','completed','skipped','cancelled'].map(st =>
                                            `<option value="${st}" ${st === t.status_code ? 'selected' : ''}>${st.replaceAll('_',' ')}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                            `).join('')}
                        </div>

                        <form onsubmit="wfAddTask(event, ${Number(stageId)})" class="wf-add-task">
                            <input name="task_name" placeholder="New subtask..." required style="flex:1;">
                            <label style="display:flex; align-items:center; gap:6px;">
                                <input type="checkbox" name="is_mandatory" checked> Mandatory
                            </label>
                            <button type="submit">Add Task</button>
                        </form>
                    </div>

                    <div class="wf-stage-section">
                        <h5 style="margin-top:16px; color:#e2e8f0; border-bottom:1px solid #334155; padding-bottom:8px;">Documents</h5>
                        <div class="wf-document-list">
                            ${docs.length === 0 ? '<div class="wf-card" style="color:#94a3b8; font-style:italic;">No documents uploaded yet.</div>' : docs.map(d => `
                                <div class="wf-document-item">
                                    <div style="flex:1;">
                                        <div style="color:#e2e8f0; font-weight:600;">${escapeHtml(d.document_name ?? '')}</div>
                                        ${d.description ? `<div style="color:#94a3b8; font-size:0.85rem; margin-top:2px;">${escapeHtml(d.description)}</div>` : ''}
                                        <div style="color:#64748b; font-size:0.8rem; margin-top:4px;">
                                            Version: ${Number(d.current_version) ?? 1} | Uploaded: ${new Date(d.uploaded_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <a href="${escapeHtml(d.file_path)}" download style="color:#93c5fd; text-decoration:none; padding:4px 8px; border:1px solid #334155; border-radius:4px; background:rgba(59,130,246,0.1); white-space:nowrap;">
                                        📥 Download
                                    </a>
                                </div>
                            `).join('')}
                        </div>

                        <form onsubmit="wfUploadDoc(event, ${Number(stageId)})" enctype="multipart/form-data" class="wf-upload" style="margin-top:10px;">
                            <input type="text" name="document_name" placeholder="Document name (e.g., Pleadings Draft)" required style="flex:1;">
                            <input type="file" name="doc_file" required>
                            <button type="submit">Upload Document</button>
                        </form>
                    </div>
                </div>
            `;
        } catch (err) {
            console.error('wfOpenStage error:', err);
            panel.innerHTML = '<div class="wf-card">Failed to load stage details.</div>';
        }
    }

    async function wfUpdateTaskStatus(taskId, status) {
        try {
            const body = new URLSearchParams({
                action: 'update_task_status',
                task_id: String(taskId),
                status: String(status)
            });

            const res = await fetch('modules/workflow/api/workflow_actions.php', {
                method: 'POST',
                headers: { 'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8' },
                body: body.toString()
            });

            const text = await res.text();
            let j;
            try {
                j = JSON.parse(text);
            } catch (e) {
                console.error('wfUpdateTaskStatus non-JSON response:', text);
                alert('Invalid response while updating task.');
                return;
            }

            if (!j.success) {
                alert(j.message || 'Failed');
                return;
            }

            wfLoadTimeline();
        } catch (err) {
            console.error('wfUpdateTaskStatus error:', err);
            alert('Failed to update task status.');
        }
    }

    async function wfAddTask(e, stageId) {
        e.preventDefault();
        try {
            const fd = new FormData(e.target);
            fd.append('action', 'add_task');
            fd.append('stage_id', String(stageId));

            const res = await fetch('modules/workflow/api/workflow_actions.php', { method:'POST', body: fd });
            const text = await res.text();

            let j;
            try {
                j = JSON.parse(text);
            } catch (err) {
                console.error('wfAddTask non-JSON response:', text);
                alert('Invalid response while adding task.');
                return;
            }

            if (!j.success) {
                alert(j.message || 'Failed');
                return;
            }

            await wfOpenStage(stageId);
            await wfLoadTimeline();
            e.target.reset();
        } catch (err) {
            console.error('wfAddTask error:', err);
            alert('Failed to add task.');
        }
    }

    async function wfUploadDoc(e, stageId) {
        e.preventDefault();
        try {
            const fd = new FormData(e.target);
            fd.append('action', 'upload_document');
            fd.append('stage_id', String(stageId));

            const res = await fetch('modules/workflow/api/workflow_upload.php', { method:'POST', body: fd });
            const text = await res.text();

            let j;
            try {
                j = JSON.parse(text);
            } catch (err) {
                console.error('wfUploadDoc non-JSON response:', text);
                alert('Invalid response while uploading.');
                return;
            }

            if (!j.success) {
                alert(j.message || 'Upload failed');
                return;
            }

            alert('Document uploaded successfully!');
            e.target.reset();
            
            // Refresh the stage panel to show new document
            await wfOpenStage(stageId);
            
        } catch (err) {
            console.error('wfUploadDoc error:', err);
            alert('Upload failed');
        }
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value ?? '');
        return div.innerHTML;
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('workflowRoot')) {
            wfLoadTimeline();
        }
    });

    // Export functions to global scope
    window.wfEnsure = wfEnsure;
    window.wfLoadTimeline = wfLoadTimeline;
    window.wfOpenStage = wfOpenStage;
    window.wfUpdateTaskStatus = wfUpdateTaskStatus;
    window.wfAddTask = wfAddTask;
    window.wfUploadDoc = wfUploadDoc;
    window.escapeHtml = escapeHtml;
}
