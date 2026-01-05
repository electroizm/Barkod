/**
 * Doğtaş API Rotaları
 * ShipmentGrid verisi çekme
 */

const express = require('express');
const router = express.Router();

// API Konfigürasyonu - .env dosyasından alınacak
const DOGTAS_CONFIG = {
    baseUrl: process.env.DOGTAS_BASE_URL || 'https://bayi.doganlarmobilyagrubu.com',
    userName: process.env.DOGTAS_USERNAME || '',
    password: process.env.DOGTAS_PASSWORD || '',
    clientId: process.env.DOGTAS_CLIENT_ID || '',
    clientSecret: process.env.DOGTAS_CLIENT_SECRET || '',
    applicationCode: process.env.DOGTAS_APPLICATION_CODE || '',
    customerNo: process.env.DOGTAS_CUSTOMER_NO || ''
};

// Token cache
let tokenCache = {
    token: null,
    expiresAt: null
};

/**
 * Token alma fonksiyonu
 */
async function getToken() {
    // Cache kontrolü - token hala geçerliyse kullan
    if (tokenCache.token && tokenCache.expiresAt && new Date() < tokenCache.expiresAt) {
        return tokenCache.token;
    }

    try {
        const response = await fetch(`${DOGTAS_CONFIG.baseUrl}/Authorization/GetAccessToken`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userName: DOGTAS_CONFIG.userName,
                password: DOGTAS_CONFIG.password,
                clientId: DOGTAS_CONFIG.clientId,
                clientSecret: DOGTAS_CONFIG.clientSecret,
                applicationCode: DOGTAS_CONFIG.applicationCode
            })
        });

        const data = await response.json();

        if (data.isSuccess && data.data && data.data.accessToken) {
            // Token'ı cache'le (55 dakika geçerli varsayalım)
            tokenCache.token = data.data.accessToken;
            tokenCache.expiresAt = new Date(Date.now() + 55 * 60 * 1000);
            return tokenCache.token;
        }

        console.error('Token alma başarısız:', data);
        return null;
    } catch (error) {
        console.error('Token alma hatası:', error);
        return null;
    }
}

/**
 * Tarih formatı dönüştürme (YYYY-MM-DD -> DD.MM.YYYY)
 */
function formatTarihAPI(tarih) {
    if (!tarih) return '';
    const [yil, ay, gun] = tarih.split('-');
    return `${gun}.${ay}.${yil}`;
}

/**
 * Nakliye Arama API Endpoint
 * POST /api/dogtas/nakliye-ara
 */
router.post('/nakliye-ara', async (req, res) => {
    try {
        const { depoYeri, baslangicTarihi, bitisTarihi, nakliyeNo } = req.body;

        // Validasyon
        if (!baslangicTarihi || !bitisTarihi) {
            return res.json({
                success: false,
                message: 'Başlangıç ve bitiş tarihi gereklidir'
            });
        }

        // Token al
        const token = await getToken();
        if (!token) {
            return res.json({
                success: false,
                message: 'API bağlantısı kurulamadı. Lütfen daha sonra tekrar deneyin.'
            });
        }

        // ShipmentGrid API çağrısı
        const payload = {
            shipmentNo: nakliyeNo || '',
            CustomerNo: DOGTAS_CONFIG.customerNo,
            ShipmentDateStart: formatTarihAPI(baslangicTarihi),
            ShipmentDateEnd: formatTarihAPI(bitisTarihi),
            storageLocation: depoYeri || ''
        };

        console.log('ShipmentGrid API isteği:', payload);

        const response = await fetch(`${DOGTAS_CONFIG.baseUrl}/ShipmentGrid`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        console.log('ShipmentGrid API yanıtı:', data);

        if (data.isSuccess && Array.isArray(data.data)) {
            // Nakliye numarasına göre filtrele (eğer girilmişse)
            let sonuclar = data.data;

            if (nakliyeNo) {
                sonuclar = sonuclar.filter(item =>
                    item.shipmentNo && item.shipmentNo.toString().includes(nakliyeNo)
                );
            }

            // Depo yerine göre filtrele
            if (depoYeri) {
                sonuclar = sonuclar.filter(item =>
                    item.storageLocation === depoYeri
                );
            }

            return res.json({
                success: true,
                data: sonuclar,
                toplam: sonuclar.length
            });
        } else {
            return res.json({
                success: false,
                message: data.message || 'Veri alınamadı',
                data: []
            });
        }
    } catch (error) {
        console.error('Nakliye arama hatası:', error);
        return res.json({
            success: false,
            message: 'Sunucu hatası oluştu',
            error: error.message
        });
    }
});

/**
 * Nakliye Detayları API Endpoint
 * POST /api/dogtas/nakliye-detay
 */
router.post('/nakliye-detay', async (req, res) => {
    try {
        const { shipmentNo } = req.body;

        if (!shipmentNo) {
            return res.json({
                success: false,
                message: 'Nakliye numarası gereklidir'
            });
        }

        // Token al
        const token = await getToken();
        if (!token) {
            return res.json({
                success: false,
                message: 'API bağlantısı kurulamadı'
            });
        }

        // Nakliye detaylarını çek
        const response = await fetch(`${DOGTAS_CONFIG.baseUrl}/ShipmentDetail`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                shipmentNo: shipmentNo,
                CustomerNo: DOGTAS_CONFIG.customerNo
            })
        });

        const data = await response.json();

        if (data.isSuccess && data.data) {
            return res.json({
                success: true,
                data: data.data
            });
        } else {
            return res.json({
                success: false,
                message: data.message || 'Detay alınamadı'
            });
        }
    } catch (error) {
        console.error('Nakliye detay hatası:', error);
        return res.json({
            success: false,
            message: 'Sunucu hatası oluştu'
        });
    }
});

module.exports = router;
