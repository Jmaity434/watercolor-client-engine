/**
 * RecordEngine
 * MediaRecorder wrapper bound to a canvas stream.
 * Supports WebM (VP9/VP8) and MP4 (Safari/iOS).
 */

function getOptimalMimeType() {
    const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4;codecs=avc1',
        'video/mp4'
    ];
    for (const type of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return 'video/webm';
}

export class RecordEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.currentMime = getOptimalMimeType();
    }

    start(requestedMime) {
        if (this.isRecording) return;

        this.recordedChunks = [];
        const stream = this.canvas.captureStream(30);

        let mimeType = requestedMime || getOptimalMimeType();
        if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = getOptimalMimeType();
        }
        this.currentMime = mimeType;

        try {
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 6_000_000
            });
        } catch (_) {
            this.mediaRecorder = new MediaRecorder(stream);
            this.currentMime = this.mediaRecorder.mimeType || 'video/webm';
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.start(1000);
        this.isRecording = true;
    }

    stop() {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                this.isRecording = false;
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                this.isRecording = false;
                const type = this.currentMime.split(';')[0] || 'video/webm';
                const blob = new Blob(this.recordedChunks, { type });
                const url = URL.createObjectURL(blob);
                resolve({ blob, url, type });
            };

            this.mediaRecorder.onerror = (e) => {
                this.isRecording = false;
                reject(e);
            };

            this.mediaRecorder.stop();
        });
    }

    async stopAndDownload(filenamePrefix = 'watercolor-render') {
        const result = await this.stop();
        if (!result) return null;

        const isMp4 = result.type.includes('mp4');
        const ext = isMp4 ? 'mp4' : 'webm';

        const a = document.createElement('a');
        a.href = result.url;
        a.download = `${filenamePrefix}-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(result.url), 60_000);
        return result.url;
    }

    getState() {
        return {
            isRecording: this.isRecording,
            chunks: this.recordedChunks.length,
            mime: this.currentMime,
        };
    }
}

export default RecordEngine;
