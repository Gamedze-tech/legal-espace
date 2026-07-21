<?php
declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) session_start();
require_once __DIR__ . '/../../../db.php';

/**
 * Embed-safe fileId resolution:
 * 1) $file_id from parent scope (individualfiles.php)
 * 2) $GLOBALS['file_id']
 * 3) GET id/file_id
 */
$fileId = 0;
if (isset($file_id) && (int)$file_id > 0) {
    $fileId = (int)$file_id;
} elseif (isset($GLOBALS['file_id']) && (int)$GLOBALS['file_id'] > 0) {
    $fileId = (int)$GLOBALS['file_id'];
} else {
    $fileId = (int)($_GET['id'] ?? $_GET['file_id'] ?? 0);
}

if ($fileId <= 0) {
    echo "<div style='margin-top:12px;color:#fca5a5;'>Workflow: invalid file context.</div>";
    return;
}

$wfStmt = $conn->prepare("SELECT id FROM matter_workflows WHERE file_id=? LIMIT 1");
$wfStmt->bind_param("i", $fileId);
$wfStmt->execute();
$workflow = $wfStmt->get_result()->fetch_assoc();
$wfStmt->close();

$workflowId = (int)($workflow['id'] ?? 0);
?>
<link rel="stylesheet" href="modules/workflow/assets/workflow.css">

<div id="workflowRoot" data-file-id="<?= (int)$fileId ?>" data-workflow-id="<?= (int)$workflowId ?>">
    <div class="wf-head">
        <h3>Workflow Engine</h3>
        <button type="button" onclick="wfEnsure()">Initiate Workflow</button>
    </div>
    <div id="wfTimeline"></div>
</div>
