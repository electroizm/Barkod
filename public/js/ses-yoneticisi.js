/**
 * Ses Yoneticisi - AudioContext Singleton
 * Tum sayfalarda ortak kullanim icin tekil AudioContext yonetimi.
 * Her cagrida yeni AudioContext olusturmak yerine tek instance kullanir.
 *
 * Kullanim: SesYoneticisi.sesliGeriBildirim('basarili')
 * Tipler: 'basarili', 'tekrar', 'hata', 'tamamlandi'
 */

const SesYoneticisi = {
    _ctx: null,

    _contextAl() {
        if (!this._ctx) {
            try {
                this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn('AudioContext olusturulamadi:', e);
                return null;
            }
        }
        // Suspended durumundaysa resume et (iOS/Chrome autoplay policy)
        if (this._ctx.state === 'suspended') {
            this._ctx.resume();
        }
        return this._ctx;
    },

    sesliGeriBildirim(tip) {
        // Titresim
        if ('vibrate' in navigator) {
            if (tip === 'basarili') navigator.vibrate(100);
            else if (tip === 'hata' || tip === 'tekrar') navigator.vibrate([100, 50, 100, 50, 100]);
            else if (tip === 'tamamlandi') navigator.vibrate([100, 50, 100, 50, 200]);
        }

        try {
            const ctx = this._contextAl();
            if (!ctx) return;

            if (tip === 'basarili') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 880;
                osc.type = 'sine';
                gain.gain.value = 0.3;
                osc.start();
                osc.stop(ctx.currentTime + 0.1);

            } else if (tip === 'tekrar') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 440;
                osc.type = 'sawtooth';
                gain.gain.value = 0.4;
                osc.start();
                osc.stop(ctx.currentTime + 0.1);

                // Ikinci ses (ayni context uzerinden)
                setTimeout(() => {
                    try {
                        const osc2 = ctx.createOscillator();
                        const gain2 = ctx.createGain();
                        osc2.connect(gain2);
                        gain2.connect(ctx.destination);
                        osc2.frequency.value = 440;
                        osc2.type = 'sawtooth';
                        gain2.gain.value = 0.4;
                        osc2.start();
                        osc2.stop(ctx.currentTime + 0.1);
                    } catch (e) { }
                }, 150);

            } else if (tip === 'hata') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 220;
                osc.type = 'square';
                gain.gain.value = 0.3;
                osc.start();
                osc.stop(ctx.currentTime + 0.3);

            } else if (tip === 'tamamlandi') {
                const notes = [523, 659, 784, 1047];
                let startTime = ctx.currentTime;
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = freq;
                    osc.type = 'sine';
                    gain.gain.value = 0.2;
                    osc.start(startTime + i * 0.15);
                    osc.stop(startTime + i * 0.15 + 0.15);
                });
            }
        } catch (e) { }
    }
};

// Global erisim
window.SesYoneticisi = SesYoneticisi;
