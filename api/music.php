<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

define('START_TIME', microtime(true));
define('DATA_FILE', __DIR__ . '/current_data.json');
define('RATE_LIMIT_DIR', __DIR__ . '/cache');
define('LOG_FILE', __DIR__ . '/debug.log');

final class MusicApi
{
    private array $config;
    private string $clientIp;

    public function __construct()
    {
        $this->config = [
            'cache_ttl' => 0,
            'allowed_origins' => ['*'],
            'rate_limit' => [
                'enabled' => true,
                'max_requests' => 1000,
                'window_seconds' => 60
            ],
            'log_enabled' => true
        ];
        $this->clientIp = $this->getClientIp();
        $this->setCorsHeaders();
    }

    private function setCorsHeaders(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
        header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept');
        header('Access-Control-Max-Age: 86400');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    private function getClientIp(): string
    {
        $headers = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'REMOTE_ADDR'
        ];

        foreach ($headers as $header) {
            $ip = $_SERVER[$header] ?? null;
            if ($ip && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return $ip;
            }
        }

        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    private function checkRateLimit(): bool
    {
        if (!($this->config['rate_limit']['enabled'] ?? false)) {
            return true;
        }

        $maxRequests = $this->config['rate_limit']['max_requests'];
        $windowSeconds = $this->config['rate_limit']['window_seconds'];
        $cacheFile = RATE_LIMIT_DIR . '/rate_limit_' . md5($this->clientIp) . '.json';

        $now = time();
        $requests = [];

        if (file_exists($cacheFile)) {
            $requests = json_decode(file_get_contents($cacheFile), true) ?: [];
            $requests = array_filter($requests, fn($t) => ($now - $t) < $windowSeconds);
        }

        if (count($requests) >= $maxRequests) {
            return false;
        }

        $requests[] = $now;
        $this->ensureDirectory(dirname($cacheFile));
        file_put_contents($cacheFile, json_encode($requests), LOCK_EX);

        return true;
    }

    private function ensureDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }

    public function handleRequest(): void
    {
        try {
            if (!$this->checkRateLimit()) {
                $this->sendError(429, '请求过于频繁');
            }

            $action = $this->sanitizeInput($_GET['action'] ?? 'current');

            if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'update') {
                $this->handleUpdate();
                return;
            }

            $this->validateAction($action);

            $startTime = microtime(true);
            $data = $this->getData($action);
            $responseTime = round((microtime(true) - $startTime) * 1000, 2);

            $this->sendResponse([
                'code' => 200,
                'message' => 'success',
                'response_time_ms' => $responseTime,
                'timestamp' => time(),
                'data' => $data
            ]);

        } catch (\Exception $e) {
            $this->sendError(500, '服务器错误: ' . $e->getMessage());
        }
    }

    private function handleUpdate(): void
    {
        $input = file_get_contents('php://input');

        if (empty($input)) {
            $this->sendError(400, '请求数据为空');
        }

        $data = json_decode($input, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->sendError(400, 'JSON格式错误');
        }

        $this->validatePlayerData($data);

        $result = file_put_contents(DATA_FILE, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);

        if ($result === false) {
            $this->sendError(500, '写入文件失败');
        }

        $this->sendResponse([
            'code' => 200,
            'message' => '数据更新成功',
            'timestamp' => time()
        ]);
    }

    private function validatePlayerData(array $data): void
    {
        if (!isset($data['playing'])) {
            $this->sendError(400, '缺少playing字段');
        }
    }

    private function sanitizeInput(string $input): string
    {
        return preg_replace('/[^a-zA-Z0-9_-]/', '', $input) ?: 'current';
    }

    private function validateAction(string $action): void
    {
        $allowedActions = ['current', 'song', 'progress', 'lyrics', 'status', 'health'];
        if (!in_array($action, $allowedActions, true)) {
            $this->sendError(400, '无效的操作');
        }
    }

    private function getData(string $action): array
    {
        if (!file_exists(DATA_FILE)) {
            return $this->getEmptyData('暂无播放数据');
        }

        $content = file_get_contents(DATA_FILE);
        if ($content === false) {
            return $this->getEmptyData('读取失败');
        }

        $data = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return $this->getEmptyData('数据格式错误');
        }

        return match ($action) {
            'song' => $data['playing']['song'] ?? [],
            'progress' => $data['playing']['progress'] ?? [],
            'lyrics' => $data['playing']['lyrics'] ?? [],
            'status' => [
                'is_playing' => $data['playing']['isPlaying'] ?? false,
                'last_update' => $data['timestamp'] ?? 0
            ],
            'health' => $this->getHealthStatus($data),
            default => $data
        };
    }

    private function getEmptyData(string $message): array
    {
        return [
            'status' => 'error',
            'message' => $message,
            'timestamp' => time(),
            'playing' => [
                'isPlaying' => false,
                'song' => [
                    'id' => 0,
                    'name' => '',
                    'artists' => [],
                    'album' => ['id' => 0, 'name' => '', 'cover' => ''],
                    'duration' => 0
                ],
                'progress' => [
                    'currentTime' => 0,
                    'duration' => 0,
                    'percent' => 0,
                    'formattedCurrentTime' => '00:00',
                    'formattedDuration' => '00:00'
                ],
                'lyrics' => [
                    'available' => false,
                    'raw' => '',
                    'parsed' => []
                ]
            ]
        ];
    }

    private function getHealthStatus(array $data): array
    {
        $lastUpdate = $data['timestamp'] ?? 0;
        $secondsSinceUpdate = time() - (int)($lastUpdate / 1000);

        return [
            'status' => $secondsSinceUpdate > 30 ? 'warning' : 'healthy',
            'last_update' => $lastUpdate,
            'seconds_since_update' => $secondsSinceUpdate,
            'server_time' => time()
        ];
    }

    private function sendResponse(array $data): void
    {
        $responseTime = round((microtime(true) - START_TIME) * 1000, 2);
        $data['total_time_ms'] = $responseTime;

        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    private function sendError(int $code, string $message): void
    {
        http_response_code($code);
        echo json_encode([
            'code' => $code,
            'message' => $message,
            'timestamp' => time()
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$api = new MusicApi();
$api->handleRequest();
