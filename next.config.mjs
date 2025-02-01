/** @type {import('next').NextConfig} */

const nextConfig = {
    reactStrictMode: false,
    images: {
        remotePatterns: [
            {
                hostname: "res.cloudinary.com"
            }
        ]
    },
    output: "standalone",
};

export default nextConfig;
