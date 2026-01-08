/**
 * Doğtaş API Rotaları
 * ShipmentGrid verisi çekme
 * Config: PRGsheet Ayar sayfasından okunur
 */

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

// Google Sheets yapılandırması (.env'den)
const PRGSHEET_NAME = 'PRGsheet'; // Spreadsheet adı
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// API Konfigürasyonu - PRGsheet Ayar sayfasından yüklenecek
let DOGTAS_CONFIG = {
    baseUrl: '',
    nakliyeEndpoint: '',
    userName: '',
    password: '',
    clientId: '',
    clientSecret: '',
    applicationCode: '',
    customerNo: ''
};

// Config yükleme durumu
let configYuklendi = false;

// Token cache
let tokenCache = {
    token: null,
    expiresAt: null
};

/**
 * PRGsheet Ayar sayfasından API konfigürasyonlarını yükler
 * Önce Drive API ile spreadsheet ID'sini bulur, sonra Sheets API ile okur
 */
async function configYukle() {
    if (configYuklendi) return true;

    try {
        const auth = new google.auth.JWT(
            GOOGLE_SERVICE_ACCOUNT_EMAIL,
            null,
            GOOGLE_PRIVATE_KEY,
            [
                'https://www.googleapis.com/auth/spreadsheets.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        );

        // Drive API ile PRGsheet'in ID'sini bul
        const drive = google.drive({ version: 'v3', auth });
        const driveYanit = await drive.files.list({
            q: `name='${PRGSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet'`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (!driveYanit.data.files || driveYanit.data.files.length === 0) {
            console.error('PRGsheet bulunamadı');
            return false;
        }

        const spreadsheetId = driveYanit.data.files[0].id;
        console.log('PRGsheet bulundu, ID:', spreadsheetId);

        // Sheets API ile Ayar sayfasını oku - tüm sütunları al
        const sheets = google.sheets({ version: 'v4', auth });
        const yanit = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Ayar' // Tüm sayfa
        });

        const satirlar = yanit.data.values || [];

        if (satirlar.length <= 1) {
            console.error('PRGsheet Ayar sayfası boş veya sadece başlık içeriyor');
            return false;
        }

        // Başlık satırında Key ve Value sütunlarını bul
        // PRGsheet yapısı: App Name | Key | Description | Value
        const headers = satirlar[0];
        let keyIndex = headers.indexOf('Key');
        let valueIndex = headers.indexOf('Value');

        // Eğer Key/Value yoksa, varsayılan: Key=1, Value=3
        if (keyIndex === -1) keyIndex = 1;
        if (valueIndex === -1) valueIndex = 3;


        // Key/Value sözlüğü oluştur
        const config = {};
        for (let i = 1; i < satirlar.length; i++) {
            const satir = satirlar[i];
            const key = satir[keyIndex]?.trim() || '';
            const value = satir[valueIndex]?.trim() || '';
            if (key) {
                config[key] = value;
            }
        }

        // Doğtaş API konfigürasyonunu yükle
        DOGTAS_CONFIG = {
            baseUrl: config['base_url'] || '',
            nakliyeEndpoint: config['nakliye'] || '',
            userName: config['userName'] || '',
            password: config['password'] || '',
            clientId: config['clientId'] || '',
            clientSecret: config['clientSecret'] || '',
            applicationCode: config['applicationCode'] || '',
            customerNo: config['CustomerNo'] || ''
        };

        configYuklendi = true;
        console.log('Doğtaş API konfigürasyonu PRGsheet\'ten yüklendi.');
        return true;
    } catch (hata) {
        console.error('PRGsheet config yükleme hatası:', hata.message);
        return false;
    }
}

/**
 * Token alma fonksiyonu
 */
async function getToken() {
    // Önce config yükle
    const configYuklenmis = await configYukle();
    if (!configYuklenmis) {
        console.error('Config yüklenemedi, token alınamıyor');
        return null;
    }

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
 *
 * Payload yapısı (Doğtaş API):
 * - deliveryDocument: boş (zorunlu değil)
 * - orderer: CustomerNo
 * - transportationNumber: Nakliye Numarası (opsiyonel)
 * - documentDateStart: Başlangıç Tarihi (varsayılan: 7 gün önce)
 * - documentDateEnd: Bitiş Tarihi (varsayılan: bugün)
 */
router.post('/nakliye-ara', async (req, res) => {
    try {
        const { baslangicTarihi, bitisTarihi, nakliyeNo } = req.body;

        // Varsayılan tarihler: 7 gün önce - bugün
        const bugun = new Date();
        const yediGunOnce = new Date();
        yediGunOnce.setDate(bugun.getDate() - 7);

        const baslangic = baslangicTarihi || yediGunOnce.toISOString().split('T')[0];
        const bitis = bitisTarihi || bugun.toISOString().split('T')[0];

        // Token al
        const token = await getToken();
        if (!token) {
            return res.json({
                success: false,
                message: 'API bağlantısı kurulamadı. Lütfen daha sonra tekrar deneyin.'
            });
        }

        // Nakliye API çağrısı - PRGsheet'teki 'nakliye' endpoint'i kullanılır
        const payload = {
            deliveryDocument: '',
            orderer: DOGTAS_CONFIG.customerNo,
            transportationNumber: nakliyeNo || '',
            documentDateStart: formatTarihAPI(baslangic),
            documentDateEnd: formatTarihAPI(bitis)
        };

        const apiUrl = `${DOGTAS_CONFIG.baseUrl}${DOGTAS_CONFIG.nakliyeEndpoint}`;
        console.log('Nakliye API isteği:', apiUrl, payload);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.isSuccess && Array.isArray(data.data)) {
            let sonuclar = data.data;

            // Yarı mamülleri filtrele - EAN kodu boş olanlar yarı mamüldür
            // Sadece EAN kodu dolu olan ürünleri (mamül) al
            const oncekiAdet = sonuclar.length;
            sonuclar = sonuclar.filter(item => {
                const ean = item.ean || '';
                // EAN boş veya sadece boşluk ise yarı mamüldür, alma
                return ean.trim() !== '';
            });

            // storageLocation'a göre filtrele (Biga=0002, İnegöl=0200)
            const { depoYeri } = req.body;
            if (depoYeri) {
                sonuclar = sonuclar.filter(item => item.storageLocation === depoYeri);
            }

            // distributionDocumentNumber'a göre grupla
            const grupluVeri = {};
            sonuclar.forEach(item => {
                const grupKey = `${item.documanetDate}_${item.distributionDocumentNumber}_${item.shipmentVehicleLicensePlate}_${item.shipmentVehicleDriverName}`;

                if (!grupluVeri[grupKey]) {
                    grupluVeri[grupKey] = {
                        documanetDate: item.documanetDate,
                        distributionDocumentNumber: item.distributionDocumentNumber,
                        shipmentVehicleLicensePlate: item.shipmentVehicleLicensePlate,
                        shipmentVehicleDriverName: item.shipmentVehicleDriverName,
                        storageLocation: item.storageLocation,
                        receiver: item.receiver,
                        toplamKalem: 0,
                        toplamPaket: 0,
                        kalemler: []
                    };
                }

                grupluVeri[grupKey].toplamKalem++;
                grupluVeri[grupKey].toplamPaket += parseInt(item.productPackages) || 0;
                grupluVeri[grupKey].kalemler.push(item);
            });

            // Gruplanmış veriyi diziye çevir
            const grupluDizi = Object.values(grupluVeri);

            return res.json({
                success: true,
                data: grupluDizi,
                toplam: grupluDizi.length,
                toplamKalem: sonuclar.length
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
