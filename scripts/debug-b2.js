require("dotenv").config();

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

async function main() {
  const client = new S3Client({
    endpoint: process.env.B2_ENDPOINT || "https://s3.us-west-004.backblazeb2.com",
    region: process.env.B2_REGION || "us-west-004",
    credentials: {
      accessKeyId: process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID || "",
      secretAccessKey: process.env.B2_APPLICATION_KEY || "",
    },
    forcePathStyle: true,
  });

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME || "excerpt-clips",
        Key: `debug/raw-${Date.now()}.txt`,
        Body: "hello",
        ContentType: "text/plain",
      })
    );
    console.log(JSON.stringify({ ok: true }, null, 2));
  } catch (err) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          name: err && err.name,
          message: err && err.message,
          code: err && err.code,
          Code: err && err.Code,
          statusCode: err && err.$metadata && err.$metadata.httpStatusCode,
          requestId: err && err.$metadata && err.$metadata.requestId,
          extendedRequestId: err && err.$metadata && err.$metadata.extendedRequestId,
          cfId: err && err.$metadata && err.$metadata.cfId,
          stackTop: String((err && err.stack) || "")
            .split("\n")
            .slice(0, 8),
        },
        null,
        2
      )
    );
  }
}

main();
