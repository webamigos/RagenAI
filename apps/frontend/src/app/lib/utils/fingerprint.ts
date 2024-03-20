import fingerPrint from '@fingerprintjs/fingerprintjs';

export const loadFingerprint = async () => {
  const fpPromise = await fingerPrint.load();
  const result = await fpPromise.get();
  const visitorId = await result.visitorId;
  return visitorId;
};
