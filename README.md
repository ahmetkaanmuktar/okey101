# 🎯 Okey Adisyon - Skor Takip Uygulaması

Modern, mobil uyumlu, şık tasarımlı okey oyunu için skor takip uygulaması. GitHub Pages'te derlemesiz çalışır.

## 🌟 Özellikler

### 🎮 Oyun Modları
- **4 Oyuncu (Tekli)**: Dörtlü bireysel oyun  
- **Eşli (2v2)**: Takım bazında oyun

### 🎯 Skor Sistemi
- **Hedef El**: 7, 11 veya 15 el seçenekleri
- **Milestone/Ara Toplam**: Hedef-1 elde ara toplam gösterimi
- **Skor Girişi**: 0-999 arası pozitif, -101 negatif değer desteği
- **Hızlı -101 Butonu**: Her hücrede toggle özellikli

### 📝 Siler Defteri
- **Genel Ceza Sistemi**: Oyuncu/takım bazında ceza ekleme
- **Detaylı Kayıt**: Tarih, saat, not alanları
- **Esnek Ceza Değerleri**: -101 varsayılan, özel negatif değerler

### 📊 Hesaplama & Takip
- **Canlı Toplamlar**: El Toplamı, Siler, Genel Toplam
- **Otomatik Kazanan**: Hedef tamamlandığında belirleme
- **Geri Alma**: Son tamamlanan eli yeniden açma

### 💾 Kalıcılık & Tema
- **LocalStorage**: Tüm veriler otomatik kaydedilir
- **Karanlık/Aydınlık Tema**: Sistem teması uyumlu
- **Yazdır/PDF**: A4 dikey format, temiz çıktı

## 🚀 Kullanım

### Hızlı Başlangıç
1. Oyun modunu seçin (4 oyuncu, eşli)
2. Hedef el sayısını belirleyin (7, 11, 15)
3. Oyuncu/takım isimlerini girin
4. "Başlat" butonuna tıklayın
5. Skorları girin ve oyunu takip edin

### Klavye Kısayolları
- **Enter**: Sonraki hücreye geç
- **Shift+Enter**: Üst hücreye geç
- **ESC**: Modalları kapat

### Skor Girişi
- **Pozitif Değerler**: 0-999 arası
- **Negatif Değer**: Sadece -101
- **-101 Butonu**: Hızlı toggle (bas/kaldır)
- **Siler -101 Butonu**: Başlıklarda hızlı ceza ekleme

## 🎨 Tasarım Özellikleri

- **Modern Glassmorphism**: Şeffaf, bulanık efektler
- **Mobil Uyumlu**: Responsive tasarım
- **Mikro Animasyonlar**: Yumuşak geçişler
- **Yüksek Kontrast**: Erişilebilirlik odaklı
- **Temiz Yazdır**: PDF'e uygun çıktı

## 🛠️ Teknik Detaylar

### Dosya Yapısı
```
/
├── index.html      # Ana uygulama sayfası
├── styles.css      # Modern CSS stilleri
├── app.js          # ES Module JavaScript
├── icons.svg       # İkon sprite dosyası
└── README.md       # Bu dosya
```

### Teknolojiler
- **Saf HTML5**: Semantic markup
- **Vanilla CSS3**: Modern özellikler, CSS Grid/Flexbox
- **ES6+ JavaScript**: Module sistem, modern syntax
- **LocalStorage**: Veri kalıcılığı
- **Print CSS**: Yazdırma optimizasyonu

### Tarayıcı Uyumluluğu
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 📱 Mobil Deneyim

- **Touch Friendly**: Büyük dokunma alanları
- **Responsive Layout**: Tüm ekran boyutları
- **Hızlı Giriş**: Optimized keyboard navigation
- **Offline Çalışma**: LocalStorage ile

## 🎯 Demo & Test

**"Örnek Verilerle Doldur"** butonu ile hızlı test:
- Otomatik oyuncu isimleri
- Varsayılan ayarlar
- Hızlı başlangıç

## 📊 Veri Modeli

```javascript
{
  settings: {
    mode: 'two' | 'solo4' | 'teams2v2',
    target: 7 | 11 | 15,
    names: {...}  // Mod bazında isimler
  },
  rows: [
    { hand: 1, values: [100, 150, null, -101] }
  ],
  penalties: [
    { 
      id: 'uuid', 
      target: 'p0', 
      value: -101, 
      note: 'Açıklama',
      createdAt: 'ISO date'
    }
  ],
  theme: 'light' | 'dark'
}
```

## 🖨️ Yazdırma Özellikleri

- **A4 Dikey Format**: Optimized layout
- **Oyun Bilgileri**: Tarih, mod, hedef, oyuncular
- **Temiz Tablo**: Butonlar gizli, negatifler vurgulu
- **Siler Özeti**: Ceza kayıtları dahil

## 🌐 GitHub Pages Deployment

Bu uygulama GitHub Pages'te statik olarak çalışır:
1. Repository'yi fork edin
2. Settings > Pages > Source: Deploy from a branch
3. Branch: main, Folder: / (root)
4. Uygulamaya `https://yourusername.github.io/reponame` üzerinden erişin

## 📄 Lisans

MIT License - Açık kaynak, ücretsiz kullanım.

## 🤝 Katkı

Pull request'ler memnuniyetle karşılanır. Büyük değişiklikler için önce issue açın.

---

**Okey Adisyon** - Modern okey oyunu skor takip deneyimi 🎯