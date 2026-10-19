// Eklenti kimliğini (ID) sabitleyen anahtarı üretir ve manifest.json'a "key" olarak yazar.
// Senkronizasyon (chrome.storage.sync ve Google Drive OAuth yönlendirme adresi) her bilgisayarda
// aynı eklenti kimliğini gerektirir; paketlenmemiş eklentilerde kimlik normalde klasör yolundan
// türetildiği için makineden makineye değişir.
// Kullanım: node tools/make-key.mjs   (anahtar zaten varsa yalnızca kimliği yazdırır)
// Özel anahtar extension-key.pem olarak proje köküne kaydedilir: eklentiyi .crx olarak paketlemek
// için gerekir; GİZLİ tutun, eklenti klasörüne koymayın ve paylaşmayın.
import { generateKeyPairSync, createHash, createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const MANIFEST = new URL('../extension/manifest.json', import.meta.url);
const PEM = new URL('../extension-key.pem', import.meta.url);
const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));

export function extensionId(publicKeyB64) {
  const hash = createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('hex').slice(0, 32);
  return [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

if (!m.key) {
  let pub;
  if (existsSync(PEM)) {
    pub = createPublicKey(readFileSync(PEM, 'utf8')).export({ type: 'spki', format: 'der' });
  } else {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    writeFileSync(PEM, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    pub = publicKey.export({ type: 'spki', format: 'der' });
  }
  // "key" alanını manifest_version'dan hemen sonra yaz.
  const { manifest_version, ...rest } = m;
  writeFileSync(MANIFEST, JSON.stringify({ manifest_version, key: pub.toString('base64'), ...rest }, null, 2) + '\n');
  m.key = pub.toString('base64');
}
const id = extensionId(m.key);
console.log('Eklenti kimliği :', id);
console.log('OAuth yönlendirme:', `https://${id}.chromiumapp.org/`);
