interface SongInfo {
    id: number;
    name: string;
    artists: string[];
    album: {
        id: number;
        name: string;
        cover: string;
    };
    duration: number;
}

interface ProgressInfo {
    currentTime: number;
    duration: number;
    percent: number;
    formattedCurrentTime: string;
    formattedDuration: string;
}

interface LyricsLine {
    time: number;
    timeFormatted: string;
    text: string;
}

interface LyricsInfo {
    available: boolean;
    raw: string;
    parsed: LyricsLine[];
}

interface PlayerData {
    timestamp: number;
    status: string;
    playing: {
        isPlaying: boolean;
        song: SongInfo;
        progress: ProgressInfo;
        lyrics: LyricsInfo;
    };
}

const MusicDataExporter = {
    config: {
        apiEndpoint: 'http://your-domain.com/music.php',
        apiToken: 'your-secret-token',
        updateInterval: 1000,
        enableLog: true
    },
    lastData: null as PlayerData | null,
    lastSendTime: 0,
    lastSongId: 0,
    lastSongName: '',
    intervalId: null as number | null,
    plugin: null as any,
    observer: null as MutationObserver | null,
    audioElement: null as HTMLAudioElement | null,

    log(...args: any[]) {
        if (this.config.enableLog) {
            console.log('[shijianwo-music]', ...args);
        }
    },

    loadConfig() {
        if (!this.plugin) return;
        this.config.apiEndpoint = this.plugin.getConfig('apiEndpoint', this.config.apiEndpoint);
        this.config.apiToken = this.plugin.getConfig('apiToken', this.config.apiToken);
        this.config.updateInterval = this.plugin.getConfig('updateInterval', this.config.updateInterval);
        this.config.enableLog = this.plugin.getConfig('enableLog', this.config.enableLog);
    },

    saveConfig() {
        if (!this.plugin) return;
        this.plugin.setConfig('apiEndpoint', this.config.apiEndpoint);
        this.plugin.setConfig('apiToken', this.config.apiToken);
        this.plugin.setConfig('updateInterval', this.config.updateInterval);
        this.plugin.setConfig('enableLog', this.config.enableLog);
    },

    start() {
        this.log('插件启动...');
        this.log('API地址:', this.config.apiEndpoint);
        this.log('API令牌:', this.config.apiToken ? '已设置' : '未设置');
        
        this.setupAudioListener();
        this.setupMediaSessionListener();
        this.setupObserver();
        this.startMonitoring();
        
        this.log('插件启动完成');
    },

    setupAudioListener() {
        const setupAudio = () => {
            const audio = document.querySelector('audio');
            if (audio && audio !== this.audioElement) {
                this.audioElement = audio;
                
                audio.addEventListener('play', () => {
                    this.log('音频播放事件');
                    this.updatePlayerData(true);
                });
                
                audio.addEventListener('pause', () => {
                    this.log('音频暂停事件');
                    this.updatePlayerData(true);
                });
                
                audio.addEventListener('timeupdate', () => {
                    this.checkProgressChange();
                });
                
                audio.addEventListener('loadedmetadata', () => {
                    this.log('音频元数据加载');
                    this.updatePlayerData(true);
                });
                
                this.log('已设置音频事件监听');
            }
        };
        
        setupAudio();
        
        setTimeout(setupAudio, 1000);
        setTimeout(setupAudio, 3000);
    },

    setupMediaSessionListener() {
        if ('mediaSession' in navigator) {
            const originalSetter = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'metadata')?.set;
            
            if (originalSetter) {
                Object.defineProperty(navigator.mediaSession, 'metadata', {
                    set: function(metadata: MediaMetadata | null) {
                        originalSetter.call(this, metadata);
                        if (metadata) {
                            MusicDataExporter.log('MediaSession metadata 更新:', metadata.title);
                            setTimeout(() => MusicDataExporter.updatePlayerData(true), 100);
                        }
                    },
                    get: function() {
                        return this._metadata || null;
                    }
                });
                this.log('已设置 MediaSession 监听');
            }
        }
    },

    setupObserver() {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                const target = mutation.target as HTMLElement;
                
                if (target.classList?.contains('j-title') || 
                    target.closest?.('.j-title') ||
                    target.classList?.contains('m-player') ||
                    target.closest?.('.m-player')) {
                    this.log('DOM变化检测到播放器更新');
                    this.updatePlayerData(true);
                    return;
                }
            }
        });

        const observeElement = (selector: string, description: string) => {
            const el = document.querySelector(selector);
            if (el) {
                this.observer!.observe(el, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ['title', 'src', 'class']
                });
                this.log(`已监听 ${description}`);
            }
        };

        observeElement('.m-player', '播放器容器');
        observeElement('.j-title', '歌曲标题');
        observeElement('.n-single', '单曲信息区');
        observeElement('.cmd-player', 'CMD播放器');

        setTimeout(() => {
            observeElement('.m-player', '播放器容器(延迟)');
            observeElement('.j-title', '歌曲标题(延迟)');
        }, 2000);
    },

    startMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.intervalId = window.setInterval(() => {
            this.updatePlayerData(false);
        }, this.config.updateInterval);
    },

    lastProgressCheck: 0,
    
    checkProgressChange() {
        const now = Date.now();
        if (now - this.lastProgressCheck < 500) return;
        this.lastProgressCheck = now;
        
        if (this.audioElement) {
            const progress = this.getProgressInfo();
            if (progress.percent > 0 && progress.percent % 5 === 0) {
                this.updatePlayerData(false);
            }
        }
    },

    async updatePlayerData(forceCheck: boolean = false) {
        try {
            const playerData = await this.collectPlayerData();
            const song = playerData.playing.song;
            
            const now = Date.now();
            const forceSend = (now - this.lastSendTime) > 5000;
            
            const songChanged = (song.id !== 0 && song.id !== this.lastSongId) ||
                               (song.name && song.name !== this.lastSongName);
            
            if (forceSend || songChanged || forceCheck) {
                if (song.id !== 0) {
                    this.lastSongId = song.id;
                }
                if (song.name) {
                    this.lastSongName = song.name;
                }
                
                this.lastData = playerData;
                this.lastSendTime = now;
                await this.sendToApi(playerData);
            }
        } catch (error) {
            this.log('更新数据失败:', error);
        }
    },

    async collectPlayerData(): Promise<PlayerData> {
        const song = this.getSongInfo();
        const progress = this.getProgressInfo();
        
        return {
            timestamp: Date.now(),
            status: 'success',
            playing: {
                isPlaying: this.isPlaying(),
                song: song,
                progress: progress,
                lyrics: this.getLyricsData()
            }
        };
    },

    isPlaying(): boolean {
        const pauseBtn = document.querySelector('.btnp-pause');
        const cmdPause = document.querySelector('.cmd-icon-pause');
        const audio = document.querySelector('audio');
        
        if (audio && !audio.paused) return true;
        if (pauseBtn) return true;
        if (cmdPause) return true;
        
        return false;
    },

    getSongInfo(): SongInfo {
        const songInfo: SongInfo = {
            id: 0,
            name: '',
            artists: [],
            album: { id: 0, name: '', cover: '' },
            duration: 0
        };

        try {
            if (typeof betterncm !== 'undefined' && betterncm.ncm && betterncm.ncm.getPlayingSong) {
                try {
                    const playingSong = betterncm.ncm.getPlayingSong();
                    
                    if (playingSong) {
                        this.log('BetterNCM API 完整返回:', JSON.stringify(playingSong, null, 2));
                        
                        const data = playingSong.data || playingSong;
                        
                        songInfo.id = data.id || playingSong.id || 0;
                        
                        songInfo.name = data.name || data.songName || data.title || playingSong.name || playingSong.title || '';
                        
                        songInfo.duration = (data.duration || data.dt || playingSong.duration || 0);
                        
                        if (data.ar && Array.isArray(data.ar)) {
                            songInfo.artists = data.ar.map((a: any) => a.name || a).filter((n: string) => n);
                        } else if (data.artists && Array.isArray(data.artists)) {
                            songInfo.artists = data.artists.map((a: any) => a.name || a).filter((n: string) => n);
                        } else if (data.artistName) {
                            songInfo.artists = [data.artistName];
                        }
                        
                        if (data.al) {
                            songInfo.album.id = data.al.id || 0;
                            songInfo.album.name = data.al.name || '';
                            songInfo.album.cover = data.al.picUrl || data.al.pic || '';
                        } else if (data.album) {
                            songInfo.album.id = data.album.id || 0;
                            songInfo.album.name = data.album.name || data.albumName || '';
                            songInfo.album.cover = data.album.picUrl || data.album.cover || data.album.pic || '';
                        }
                        
                        if (data.picUrl) {
                            songInfo.album.cover = data.picUrl;
                        }
                        
                        this.log('解析结果 - ID:', songInfo.id, '名称:', songInfo.name, '艺术家:', songInfo.artists.join(','));
                        
                        if (songInfo.name) {
                            this.log('从 BetterNCM API 获取歌曲:', songInfo.name);
                            return songInfo;
                        }
                    }
                } catch (e) {
                    this.log('BetterNCM API 错误:', e);
                }
            }

            if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
                const metadata = navigator.mediaSession.metadata;
                if (metadata) {
                    this.log('MediaSession metadata:', metadata.title, metadata.artist);
                    
                    if (metadata.title) {
                        songInfo.name = metadata.title;
                    }
                    if (metadata.artist) {
                        songInfo.artists = metadata.artist.split(/[,、\/\\&]/).map(a => a.trim()).filter(a => a);
                    }
                    if (metadata.album) {
                        songInfo.album.name = metadata.album;
                    }
                    if (metadata.artwork && metadata.artwork.length > 0) {
                        const artwork = metadata.artwork[metadata.artwork.length - 1];
                        songInfo.album.cover = artwork.src;
                    }
                    
                    if (songInfo.name) {
                        this.log('从 MediaSession 获取歌曲:', songInfo.name);
                        return songInfo;
                    }
                }
            }

            const titleSelectors = [
                '.j-title',
                '.n-single .name a',
                '.m-player .title',
                '.cmd-space.title span',
                '[data-res-name]',
                '.tit em'
            ];
            
            for (const selector of titleSelectors) {
                const titleEl = document.querySelector(selector) as HTMLElement;
                if (titleEl) {
                    const title = (titleEl as any).title || titleEl.textContent?.trim() || titleEl.getAttribute('data-res-name');
                    if (title && title.length > 0 && title.length < 200) {
                        songInfo.name = title;
                        this.log('从 DOM 获取标题:', title, '选择器:', selector);
                        break;
                    }
                }
            }

            const artistSelectors = [
                'p.j-title span.f-dib',
                '.n-single .artist a',
                '.m-player .artist',
                '[data-res-author]',
                '.des.s-fc4 span',
                '.tit .sub'
            ];
            
            for (const selector of artistSelectors) {
                const artistEl = document.querySelector(selector) as HTMLElement;
                if (artistEl && artistEl.textContent) {
                    const artists = artistEl.textContent.split(/[\/\\&]/).map(a => a.trim()).filter(a => a && a.length < 100);
                    if (artists.length > 0) {
                        songInfo.artists = artists;
                        this.log('从 DOM 获取艺术家:', artists.join(', '), '选择器:', selector);
                        break;
                    }
                }
            }

            const coverSelectors = [
                '.j-cover img',
                '.j-cover',
                '.n-single .cvr img',
                '.m-player .cover img',
                '[data-res-pic]'
            ];
            
            for (const selector of coverSelectors) {
                const coverEl = document.querySelector(selector) as HTMLImageElement;
                if (coverEl && coverEl.src) {
                    let imgUrl = coverEl.src;
                    if (imgUrl.startsWith('orpheus://cache/?')) {
                        try {
                            imgUrl = decodeURIComponent(imgUrl.replace('orpheus://cache/?', ''));
                        } catch (e) {}
                    }
                    imgUrl = imgUrl.split('?')[0];
                    if (imgUrl && !imgUrl.includes('data:image')) {
                        songInfo.album.cover = imgUrl;
                        this.log('从 DOM 获取封面:', imgUrl.substring(0, 50));
                        break;
                    }
                }
            }

            const audio = document.querySelector('audio');
            if (audio && audio.duration && !isNaN(audio.duration)) {
                songInfo.duration = Math.floor(audio.duration * 1000);
            }

            songInfo.album.name = songInfo.album.name || songInfo.name;

        } catch (error) {
            this.log('获取歌曲信息失败:', error);
        }

        return songInfo;
    },

    getProgressInfo(): ProgressInfo {
        const progress: ProgressInfo = {
            currentTime: 0,
            duration: 0,
            percent: 0,
            formattedCurrentTime: '00:00',
            formattedDuration: '00:00'
        };

        try {
            const audio = document.querySelector('audio');
            if (audio && audio.duration && !isNaN(audio.duration)) {
                progress.currentTime = Math.floor(audio.currentTime * 1000);
                progress.duration = Math.floor(audio.duration * 1000);
                progress.percent = Math.round((audio.currentTime / audio.duration) * 100);
                progress.formattedCurrentTime = this.formatTime(audio.currentTime);
                progress.formattedDuration = this.formatTime(audio.duration);
            } else {
                const timeNow = document.querySelector('.m-player time.now, .time-now, .curtime');
                const timeTotal = document.querySelector('.m-player time.all, .time-total, .totaltime');
                
                if (timeNow && timeTotal) {
                    progress.formattedCurrentTime = timeNow.textContent?.trim() || '00:00';
                    progress.formattedDuration = timeTotal.textContent?.trim() || '00:00';
                    progress.currentTime = this.parseTime(progress.formattedCurrentTime);
                    progress.duration = this.parseTime(progress.formattedDuration);
                    if (progress.duration > 0) {
                        progress.percent = Math.round((progress.currentTime / progress.duration) * 100);
                    }
                }
            }
        } catch (error) {
            this.log('获取进度失败:', error);
        }

        return progress;
    },

    parseTime(timeStr: string): number {
        const parts = timeStr.split(':');
        if (parts.length === 2) {
            const mins = parseInt(parts[0], 10);
            const secs = parseInt(parts[1], 10);
            return (mins * 60 + secs) * 1000;
        }
        return 0;
    },

    formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    getLyricsData(): LyricsInfo {
        const lyrics: LyricsInfo = { available: false, raw: '', parsed: [] };

        try {
            const lyricSelectors = [
                '.m-lyric',
                '#lyric-content',
                '.lyric-content',
                '.j-lrc'
            ];
            
            for (const selector of lyricSelectors) {
                const lyricEl = document.querySelector(selector);
                if (lyricEl && lyricEl.textContent) {
                    const text = lyricEl.textContent.trim();
                    if (text.length > 0) {
                        lyrics.raw = text;
                        lyrics.available = true;
                        break;
                    }
                }
            }
        } catch (error) {
            this.log('获取歌词失败:', error);
        }

        return lyrics;
    },

    async sendToApi(data: PlayerData) {
        try {
            const response = await fetch(this.config.apiEndpoint + '?action=update', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-API-Token': this.config.apiToken
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                this.log('数据已发送:', data.playing.song.name || '未知', 'ID:', data.playing.song.id);
            } else {
                this.log('API错误:', response.status);
            }
        } catch (error) {
            this.log('发送失败:', error);
        }
    }
};

let configElement = document.createElement("div");

plugin.onLoad((selfPlugin) => {
    MusicDataExporter.plugin = selfPlugin;
    MusicDataExporter.loadConfig();
    MusicDataExporter.start();
    ReactDOM.render(<ConfigPanel />, configElement);
});

function ConfigPanel() {
    const [apiEndpoint, setApiEndpoint] = React.useState(MusicDataExporter.config.apiEndpoint);
    const [apiToken, setApiToken] = React.useState(MusicDataExporter.config.apiToken);
    const [updateInterval, setUpdateInterval] = React.useState(MusicDataExporter.config.updateInterval);
    const [enableLog, setEnableLog] = React.useState(MusicDataExporter.config.enableLog);
    const [status, setStatus] = React.useState('');

    const handleSave = () => {
        MusicDataExporter.config.apiEndpoint = apiEndpoint;
        MusicDataExporter.config.apiToken = apiToken;
        MusicDataExporter.config.updateInterval = updateInterval;
        MusicDataExporter.config.enableLog = enableLog;
        MusicDataExporter.saveConfig();
        MusicDataExporter.startMonitoring();
        setStatus('✓ 配置已保存');
    };

    const handleTest = async () => {
        setStatus('测试中...');
        try {
            const response = await fetch(apiEndpoint + '?action=health', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                setStatus('✓ 连接成功');
            } else {
                setStatus('✗ 连接失败: HTTP ' + response.status);
            }
        } catch (e: any) {
            setStatus('✗ 连接失败: ' + e.message);
        }
    };

    return (
        <div style={{ padding: '20px', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
            <h3 style={{ marginBottom: '20px' }}>视奸我-网易云插件 配置</h3>
            
            <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '13px' }}>API 地址</label>
                <input 
                    type="text" 
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', marginBottom: '15px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                    placeholder="http://your-domain.com/music.php"
                />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '13px' }}>API 令牌</label>
                <input 
                    type="text" 
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', marginBottom: '15px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                    placeholder="your-secret-token"
                />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '13px' }}>更新间隔 (毫秒)</label>
                <input 
                    type="number" 
                    value={updateInterval}
                    onChange={(e) => setUpdateInterval(parseInt(e.target.value) || 1000)}
                    style={{ width: '100px', padding: '8px 12px', marginBottom: '15px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}
                />
            </div>
            
            <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                    type="checkbox" 
                    checked={enableLog}
                    onChange={(e) => setEnableLog(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                />
                <label style={{ color: '#ccc', fontSize: '13px', cursor: 'pointer' }}>启用日志</label>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
                <button onClick={handleSave} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', background: 'linear-gradient(90deg, #ff6b6b, #ee5a5a)', color: '#fff', marginRight: '10px' }}>保存配置</button>
                <button onClick={handleTest} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', background: 'rgba(255,255,255,0.1)', color: '#fff' }}>测试连接</button>
            </div>
            
            {status && (
                <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '13px' }}>
                    {status}
                </div>
            )}
        </div>
    );
}

plugin.onConfig(() => {
    return configElement;
});
