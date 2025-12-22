<?php
/**
 * Permissions API
 * Lists available permissions and manages role-permission assignments
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$pdo = Database::getInstance()->getConnection();

switch ($method) {
    case 'GET':
        handleGet($pdo);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $grouped = isset($_GET['grouped']) && $_GET['grouped'] === 'true';

    $sql = "SELECT * FROM permissions ORDER BY category, permission_label";
    $stmt = $pdo->query($sql);
    $permissions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if ($grouped) {
        $groupedPerms = [];
        foreach ($permissions as $perm) {
            $category = $perm['category'];
            if (!isset($groupedPerms[$category])) {
                $groupedPerms[$category] = [];
            }
            $groupedPerms[$category][] = $perm;
        }
        successResponse(['permissions' => $groupedPerms]);
    } else {
        successResponse(['permissions' => $permissions]);
    }
}
