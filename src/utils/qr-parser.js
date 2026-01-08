/**
 * QR Kod Parser
 * Nakliye paketlerindeki QR kodlarını parse eder
 *
 * QR Kod Formatı:
 * 01286814037892532104202550030446631000000000000000009103920393019410200780629510200770609600102007706097000009800000000220026727699000000003200395024
 * |____________||________||________||________________||__||__|                                                           ||__________________|
 *      EAN       Tarih     Seri No   Özel Üretim Kodu  91  92                                                            99  Malzeme No (18 hane)
 *      (14)      (8)       (11)      (16 hane)         XX  XX                                                                DB'deki malzeme_no ile birebir eşleşir
 */

/**
 * QR kodunu parse eder ve içindeki bilgileri çıkarır
 * @param {string} qrKod - QR kod string'i
 * @returns {Object} Parse edilmiş QR bilgileri
 */
function qrKodParsele(qrKod) {
    if (!qrKod || typeof qrKod !== 'string') {
        return {
            basarili: false,
            hata: 'Geçersiz QR kod'
        };
    }

    try {
        // QR kod minimum uzunluk kontrolü
        if (qrKod.length < 50) {
            return {
                basarili: false,
                hata: 'QR kod çok kısa'
            };
        }

        // GS1 Format:
        // 01 + GTIN(14) + 21 + SeriNo(değişken) + 10 + ÖzelKod(16) + 91XX + 92XX + ... + 99 + MalzemeNo(18)
        //
        // "10" kodu seri numarasının içinde de geçebilir, bu yüzden doğru "10"yu bulmak için:
        // 1. Önce "21" AI kodunu bul (seri numarası başlangıcı)
        // 2. Sonra "10" + 16 haneli sayı pattern'ini ara

        // 1. "21" AI kodunu bul (pozisyon 16 civarında olmalı)
        const yirmiBirPos = qrKod.indexOf('21', 14);
        if (yirmiBirPos === -1) {
            return {
                basarili: false,
                hata: '"21" seri numarası kodu bulunamadı'
            };
        }

        // 2. "10" AI kodunu bul - seri numarasından sonra
        // "10" + 16 haneli rakam pattern'ini ara (21'den sonra)
        let onPos = -1;
        let searchPos = yirmiBirPos + 2; // 21'den sonra ara

        while (searchPos < qrKod.length - 18) {
            const pos = qrKod.indexOf('10', searchPos);
            if (pos === -1) break;

            // Bu "10"dan sonra 16 haneli rakam var mı kontrol et
            const sonrasi = qrKod.substring(pos + 2, pos + 18);
            if (sonrasi.length === 16 && /^\d{16}$/.test(sonrasi)) {
                // Ve hemen ardından "91" geliyorsa bu doğru "10"
                const sonrakiIki = qrKod.substring(pos + 18, pos + 20);
                if (sonrakiIki === '91') {
                    onPos = pos;
                    break;
                }
            }
            searchPos = pos + 1;
        }

        if (onPos === -1) {
            return {
                basarili: false,
                hata: '"10" özel üretim kodu bulunamadı'
            };
        }

        // Özel üretim kodu: "10" sonrası 16 hane
        const ozelUretimKodu = qrKod.substring(onPos + 2, onPos + 18);

        if (ozelUretimKodu.length !== 16) {
            return {
                basarili: false,
                hata: 'Özel üretim kodu 16 hane olmalı'
            };
        }

        // 3. Standart mı, kişiye özel mi?
        const kisiyeOzel = ozelUretimKodu !== '0000000000000000';

        // 4. Paket bilgilerini çıkar
        // "91" bul (özel üretim kodundan hemen sonra)
        const dokuzbirPos = onPos + 18; // "91" hemen "10"+16 hane sonrası
        if (qrKod.substring(dokuzbirPos, dokuzbirPos + 2) !== '91') {
            return {
                basarili: false,
                hata: '"91" paket toplam kodu bulunamadı'
            };
        }

        // Paket toplam: "91" sonrası 2 hane
        const paketToplamStr = qrKod.substring(dokuzbirPos + 2, dokuzbirPos + 4);
        const paketToplam = parseInt(paketToplamStr, 10);

        if (isNaN(paketToplam)) {
            return {
                basarili: false,
                hata: 'Paket toplam sayısı okunamadı'
            };
        }

        // "92" bul (91'den sonra)
        const dokuzikiPos = qrKod.indexOf('92', dokuzbirPos + 4);
        if (dokuzikiPos === -1) {
            return {
                basarili: false,
                hata: '"92" paket sıra kodu bulunamadı'
            };
        }

        // Paket sıra: "92" sonrası 2 hane
        const paketSiraStr = qrKod.substring(dokuzikiPos + 2, dokuzikiPos + 4);
        const paketSira = parseInt(paketSiraStr, 10);

        if (isNaN(paketSira)) {
            return {
                basarili: false,
                hata: 'Paket sıra numarası okunamadı'
            };
        }

        // 4. Malzeme No çıkar
        // "99" kodundan sonra gelen 18 haneli değerin son 10 hanesi
        // Örnek: 99000000003200395024 -> malzeme_no = 3200395024
        const doksandokuzPos = qrKod.lastIndexOf('99');
        if (doksandokuzPos === -1) {
            return {
                basarili: false,
                hata: '"99" malzeme kodu bulunamadı'
            };
        }

        // 99'dan sonra 18 hane olmalı
        const malzemeNo = qrKod.substring(doksandokuzPos + 2, doksandokuzPos + 20);
        if (malzemeNo.length !== 18) {
            return {
                basarili: false,
                hata: 'Malzeme numarası 18 hane olmalı (99 sonrası)'
            };
        }

        // 5. EAN kodu (ilk 14 karakter - eğer "0" ile başlıyorsa)
        let ean = '';
        if (qrKod.startsWith('0')) {
            ean = qrKod.substring(0, 14);
        }

        return {
            basarili: true,
            kisiyeOzel,
            ozelUretimKodu,
            paketToplam,
            paketSira,
            malzemeNo,           // 18 hane (DB eşleştirme için: 000000003200395024)
            ean,
            // Kişiye özel ise satınalma kalem ID olarak özel üretim kodunu kullan
            satinalmaKalemId: kisiyeOzel ? ozelUretimKodu : null,
            // Ham QR kod (kayıt için)
            qrKodHam: qrKod
        };

    } catch (error) {
        return {
            basarili: false,
            hata: 'QR kod parse hatası: ' + error.message
        };
    }
}

/**
 * QR kodun hash'ini oluşturur (hızlı karşılaştırma için)
 * @param {string} qrKod - QR kod string'i
 * @returns {string} Hash değeri
 */
function qrKodHash(qrKod) {
    if (!qrKod) return '';

    // Basit hash: ilk 20 + son 20 karakter + uzunluk
    const uzunluk = qrKod.length;
    const bas = qrKod.substring(0, 20);
    const son = qrKod.substring(Math.max(0, uzunluk - 20));

    return `${bas}...${son}:${uzunluk}`;
}

/**
 * QR kod validasyonu yapar
 * @param {string} qrKod - QR kod string'i
 * @returns {Object} Validasyon sonucu
 */
function qrKodValidasyon(qrKod) {
    const sonuc = qrKodParsele(qrKod);

    if (!sonuc.basarili) {
        return sonuc;
    }

    // Ek validasyonlar
    const hatalar = [];

    // Paket sırası paket toplamdan büyük olamaz
    if (sonuc.paketSira > sonuc.paketToplam) {
        hatalar.push(`Paket sırası (${sonuc.paketSira}) toplam paketten (${sonuc.paketToplam}) büyük olamaz`);
    }

    // Paket sırası 0 olamaz
    if (sonuc.paketSira <= 0) {
        hatalar.push('Paket sırası 0 veya negatif olamaz');
    }

    // Paket toplam 0 olamaz
    if (sonuc.paketToplam <= 0) {
        hatalar.push('Paket toplam 0 veya negatif olamaz');
    }

    // Malzeme no sadece rakam içermeli (18 hane)
    if (!/^\d{18}$/.test(sonuc.malzemeNo)) {
        hatalar.push('Malzeme numarası 18 haneli rakam olmalı');
    }

    if (hatalar.length > 0) {
        return {
            basarili: false,
            hata: hatalar.join('; '),
            detay: sonuc
        };
    }

    return sonuc;
}

module.exports = {
    qrKodParsele,
    qrKodHash,
    qrKodValidasyon
};
