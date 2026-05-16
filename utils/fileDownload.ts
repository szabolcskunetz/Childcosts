
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Cross-platform file download utility
 * Handles file downloads on web using browser APIs and native platforms using expo-file-system
 */
export async function downloadFile(content: string, fileName: string, mimeType: string = 'text/csv'): Promise<void> {
  if (Platform.OS === 'web') {
    // Web: Use browser download API
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    // Native: Use expo-file-system
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, content);
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
    } else {
      console.log('File saved to:', fileUri);
    }
  }
}

/**
 * Download a file from a Blob object
 * Handles both web and native platforms
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Web: Use browser download API
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    // Native: Convert Blob to base64 and save
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      reader.onloadend = async () => {
        try {
          const base64data = reader.result as string;
          // Remove the data URL prefix (e.g., "data:application/octet-stream;base64,")
          const base64 = base64data.split(',')[1];
          
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri);
          } else {
            console.log('File saved to:', fileUri);
          }
          
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

/**
 * Share a file URL (for native platforms after saving)
 */
export async function shareFile(fileUri: string): Promise<void> {
  if (Platform.OS !== 'web' && await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri);
  }
}
