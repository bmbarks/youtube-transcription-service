import AWS from 'aws-sdk';
import config from '../config/environment.js';
import logger from './logger.js';

const s3 = new AWS.S3({
  accessKeyId: config.spaces.accessKeyId,
  secretAccessKey: config.spaces.secretAccessKey,
  region: config.spaces.region,
  endpoint: config.spaces.endpoint,
  s3ForcePathStyle: true,
});

/**
 * Upload transcript to DigitalOcean Spaces
 * Returns public URL for the uploaded file
 */
export async function uploadTranscript(videoId, filename, content, contentType = 'text/plain') {
  try {
    const key = `transcripts/${videoId}/${filename}`;

    const params = {
      Bucket: config.spaces.bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
      ACL: 'public-read',
    };

    await s3.putObject(params).promise();

    const publicUrl = `${config.spaces.endpoint}/${config.spaces.bucket}/${key}`;
    logger.info('Transcript uploaded to Spaces', {
      videoId,
      filename,
      url: publicUrl,
      contentType,
    });

    return publicUrl;
  } catch (error) {
    logger.error('Failed to upload transcript to Spaces', {
      videoId,
      filename,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Download transcript from DigitalOcean Spaces
 */
export async function downloadTranscript(videoId, filename) {
  try {
    const key = `transcripts/${videoId}/${filename}`;

    const params = {
      Bucket: config.spaces.bucket,
      Key: key,
    };

    const result = await s3.getObject(params).promise();
    const content = result.Body.toString('utf-8');

    logger.info('Transcript downloaded from Spaces', {
      videoId,
      filename,
    });

    return content;
  } catch (error) {
    logger.error('Failed to download transcript from Spaces', {
      videoId,
      filename,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Check if transcript exists in Spaces
 */
export async function transcriptExists(videoId, filename) {
  try {
    const key = `transcripts/${videoId}/${filename}`;

    const params = {
      Bucket: config.spaces.bucket,
      Key: key,
    };

    await s3.headObject(params).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound' || error.statusCode === 404) {
      return false;
    }
    logger.error('Error checking transcript existence in Spaces', {
      videoId,
      filename,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete transcript from Spaces
 */
export async function deleteTranscript(videoId, filename) {
  try {
    const key = `transcripts/${videoId}/${filename}`;

    const params = {
      Bucket: config.spaces.bucket,
      Key: key,
    };

    await s3.deleteObject(params).promise();

    logger.info('Transcript deleted from Spaces', {
      videoId,
      filename,
    });

    return true;
  } catch (error) {
    logger.error('Failed to delete transcript from Spaces', {
      videoId,
      filename,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get public URL for transcript in Spaces
 */
export function getTranscriptUrl(videoId, filename) {
  return `${config.spaces.endpoint}/${config.spaces.bucket}/transcripts/${videoId}/${filename}`;
}

export default {
  uploadTranscript,
  downloadTranscript,
  transcriptExists,
  deleteTranscript,
  getTranscriptUrl,
};
