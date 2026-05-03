/**
 * Google Drive Integration Service
 * Handles OAuth2 flow and File Uploads to Google Drive.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let gapiInited = false;
let gisInited = false;

/**
 * Load Google API scripts dynamically
 */
export const loadGoogleScripts = () => {
  return new Promise((resolve) => {
    const script1 = document.createElement('script');
    script1.src = 'https://apis.google.com/js/api.js';
    script1.onload = () => {
      window.gapi.load('client', async () => {
        await window.gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        gapiInited = true;
        checkInit(resolve);
      });
    };
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://accounts.google.com/gsi/client';
    script2.onload = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined at login
      });
      gisInited = true;
      checkInit(resolve);
    };
    document.body.appendChild(script2);
  });
};

const checkInit = (resolve) => {
  if (gapiInited && gisInited) resolve();
};

/**
 * Trigger OAuth2 Login
 */
export const loginToGoogle = () => {
  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp) => {
      if (resp.error !== undefined) {
        reject(resp);
      }
      resolve(resp.access_token);
    };
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

/**
 * Create a folder in Google Drive if it doesn't exist
 */
export const getOrCreateFolder = async (folderName, parentId = null) => {
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${
    parentId ? ` and '${parentId}' in parents` : ''
  }`;
  
  const response = await window.gapi.client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
  });

  if (response.result.files.length > 0) {
    return response.result.files[0].id;
  }

  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : [],
  };

  const folder = await window.gapi.client.drive.files.create({
    resource: fileMetadata,
    fields: 'id',
  });

  return folder.result.id;
};

/**
 * Upload a file to a specific folder
 */
export const uploadFileToDrive = async (file, folderId) => {
  const metadata = {
    name: file.name,
    parents: [folderId],
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${window.gapi.auth.getToken().access_token}`,
    },
    body: formData,
  });

  const result = await response.json();
  return result.id;
};

/**
 * Get a temporary direct link for the image bits (used by Excel)
 */
export const getFileSource = async (fileId) => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${window.gapi.auth.getToken().access_token}`,
    },
  });
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
