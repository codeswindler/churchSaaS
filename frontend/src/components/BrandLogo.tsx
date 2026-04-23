import { useEffect, useState } from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-16 w-16',
  xl: 'h-[136px] w-[136px]',
};

let brandLogoDataUrl: string | null = null;
let brandLogoPromise: Promise<string> | null = null;

async function buildTransparentLogo() {
  if (brandLogoDataUrl) {
    return brandLogoDataUrl;
  }

  if (brandLogoPromise) {
    return brandLogoPromise;
  }

  brandLogoPromise = new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxDimension = 720;
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceContext = sourceCanvas.getContext('2d');

      if (!sourceContext) {
        reject(new Error('Unable to process logo'));
        return;
      }

      sourceContext.drawImage(image, 0, 0, width, height);
      const imageData = sourceContext.getImageData(0, 0, width, height);
      const { data } = imageData;

      let left = width;
      let top = height;
      let right = 0;
      let bottom = 0;
      let found = false;

      for (let index = 0; index < data.length; index += 4) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        const pixelIndex = index / 4;
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        const isBackground =
          alpha < 20 || (red > 242 && green > 242 && blue > 242);

        if (isBackground) {
          data[index + 3] = 0;
          continue;
        }

        found = true;
        if (x < left) left = x;
        if (y < top) top = y;
        if (x > right) right = x;
        if (y > bottom) bottom = y;
      }

      sourceContext.putImageData(imageData, 0, 0);

      if (!found) {
        brandLogoDataUrl = '/brand-logo.jpeg';
        resolve(brandLogoDataUrl);
        return;
      }

      const padding = Math.round(Math.max(width, height) * 0.045);
      const cropLeft = Math.max(0, left - padding);
      const cropTop = Math.max(0, top - padding);
      const cropRight = Math.min(width - 1, right + padding);
      const cropBottom = Math.min(height - 1, bottom + padding);
      const cropWidth = cropRight - cropLeft + 1;
      const cropHeight = cropBottom - cropTop + 1;

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = cropWidth;
      outputCanvas.height = cropHeight;
      const outputContext = outputCanvas.getContext('2d');

      if (!outputContext) {
        reject(new Error('Unable to render logo'));
        return;
      }

      outputContext.drawImage(
        sourceCanvas,
        cropLeft,
        cropTop,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      );

      brandLogoDataUrl = outputCanvas.toDataURL('image/png');
      resolve(brandLogoDataUrl);
    };

    image.onerror = () => reject(new Error('Unable to load logo image'));
    image.src = '/brand-logo.jpeg';
  });

  try {
    return await brandLogoPromise;
  } finally {
    brandLogoPromise = null;
  }
}

export function BrandLogo({
  className = '',
  size = 'md',
}: BrandLogoProps) {
  const [src, setSrc] = useState<string | null>(brandLogoDataUrl);

  useEffect(() => {
    let isMounted = true;

    buildTransparentLogo()
      .then((result) => {
        if (isMounted) {
          setSrc(result);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSrc('/brand-logo.jpeg');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!src) {
    return <span className={`${sizeClasses[size]} ${className}`} />;
  }

  return (
    <span className={`brand-logo-wrap ${sizeClasses[size]} ${className}`}>
      <img alt="Church SaaS logo" className="brand-logo-image" src={src} />
    </span>
  );
}
