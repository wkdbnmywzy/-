class XunfeiTTS {
  constructor(appId, apiKey, apiSecret) {
    this.appId = appId;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.audioBuffers = [];
  }

  // 生成鉴权URL
  getAuthUrl() {
    const date = new Date().toUTCString();
    if (typeof CryptoJS === 'undefined') {
      throw new Error('CryptoJS 未加载，无法生成讯飞 TTS 鉴权信息');
    }
    const signatureOrigin = `host: tts-api.xfyun.cn\ndate: ${date}\nGET /v2/tts HTTP/1.1`;
    const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, this.apiSecret);
    const signature = CryptoJS.enc.Base64.stringify(signatureSha);
    
    const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorization = btoa(authorizationOrigin);
    
    return `wss://tts-api.xfyun.cn/v2/tts?authorization=${authorization}&date=${encodeURIComponent(date)}&host=tts-api.xfyun.cn`;
  }

  // 合成语音
  async synthesize(text, voiceName = 'xiaoyan') {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.getAuthUrl());
      
      ws.onopen = () => {
        const params = {
          common: { app_id: this.appId },
          business: {
            aue: 'lame', // 输出MP3格式
            vcn: voiceName, // 发音人
            speed: 50, // 语速 0-100
            volume: 50, // 音量 0-100
            pitch: 50, // 音高 0-100
            bgs: 0, // 背景音 0-无 1-有
            tte: 'UTF8' // 文本编码
          },
          data: {
            status: 2,
            text: btoa(unescape(encodeURIComponent(text))) // 文本base64编码
          }
        };
        ws.send(JSON.stringify(params));
      };

      ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.data && response.data.audio) {
          // 解码音频数据
          const audioData = this.base64ToArrayBuffer(response.data.audio);
          this.audioBuffers.push(audioData);
        }
        
        if (response.code !== 0) {
          console.error('错误码:', response.code, '错误信息:', response.message);
          reject(new Error(`合成失败: ${response.message}`));
        }
        
        // 状态为2表示合成完成
        if (response.data && response.data.status === 2) {
          ws.close();
          this.playAudio().then(resolve).catch(reject);
        }
      };

      ws.onerror = (error) => {
        reject(error);
      };
    });
  }

  // 便捷接口：尝试合成并播放（失败时抛出异常）
  async speak(text, voiceName = 'xiaoyan') {
    if (!text) return Promise.resolve();
    try {
      await this.synthesize(text, voiceName);
    } catch (e) {
      // 抛出以便调用者回退处理
      throw e;
    }
  }

  // 播放音频
  async playAudio() {
    try {
      // 合并所有音频片段
      const mergedBuffer = await this.mergeAudioBuffers();
      
      // 解码MP3数据
      const audioBuffer = await this.audioContext.decodeAudioData(mergedBuffer);
      
      // 创建音频源
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
      
      return new Promise((resolve) => {
        source.onended = () => resolve();
      });
    } catch (error) {
      console.error('播放音频失败:', error);
      throw error;
    }
  }

  // Base64转ArrayBuffer
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // 合并音频缓冲区
  async mergeAudioBuffers() {
    // 简单实现：将所有音频数据合并为一个Uint8Array
    let totalLength = 0;
    this.audioBuffers.forEach(buffer => {
      totalLength += buffer.byteLength;
    });
    
    const result = new Uint8Array(totalLength);
    let offset = 0;
    this.audioBuffers.forEach(buffer => {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    });
    
    this.audioBuffers = []; // 清空缓冲区
    return result.buffer;
  }
}

// 使用示例（如果需要在页面中直接实例化）
const tts = new XunfeiTTS(
  'd85c406f', // APPID
  '0d577787a56144bde3fda6749c0f8778', // APIKey 
  'MzJiMzcwMzAzZjYxYzMxOWU5ZjE2ZWRh'  // APISecret
);

// 将实例暴露到全局，便于其他脚本复用（navigation.js 会尝试复用该实例）
try { window.xfyunTTSInstance = tts; } catch (e) { /* ignore */ }

// 调用合成方法示例（可注释掉）
// tts.synthesize('你好，欢迎使用科大讯飞语音合成服务。')
//   .then(() => console.log('播放完毕'))
//   .catch(error => console.error('合成失败:', error));  
