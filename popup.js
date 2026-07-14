const fileInput = document.getElementById("file-input");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

  await chrome.storage.local.set({
    pdfBase64: base64,
    pdfName: file.name
  });

  chrome.runtime.sendMessage({ type: "OPEN_LOCAL_PDF_VIEWER" }, () => {
    window.close();
  });
});

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}