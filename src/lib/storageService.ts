import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseStorage } from "./firebase";

/**
 * Uploads a PDF document to Firebase Storage.
 * Falls back to Base64 data URL if Firebase Storage is unavailable or offline.
 */
export async function uploadPdfToStorage(
  studentId: string,
  subject: string,
  fileName: string,
  file: File
): Promise<string> {
  try {
    const storage = await getFirebaseStorage();
    if (!storage) {
      throw new Error("Firebase storage is not initialized");
    }

    // Generate a unique clean name for the storage reference path
    const cleanSubject = subject.replace(/[^a-zA-Z0-5_]/g, "_");
    const cleanFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-5._-]/g, "_")}`;
    const storageRef = ref(storage, `students/${studentId}/${cleanSubject}/${cleanFileName}`);

    console.log(`[Storage] Starting upload to: students/${studentId}/${cleanSubject}/${cleanFileName}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    console.log(`[Storage] Upload successful. Dynamic URL retrieved: ${downloadUrl}`);
    return downloadUrl;
  } catch (error) {
    console.warn("[Storage] Firebase upload failed, activating local Base64 fallback.", error);
    
    // Transparently fall back to reading file as base64 for local sandbox persistence
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file as Base64."));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
