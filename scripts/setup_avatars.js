import fs from 'fs';
import path from 'path';

const demoDir = path.resolve('public/avatars/demo');
const boysDir = path.resolve('public/avatars/real_demo/boys');
const girlsDir = path.resolve('public/avatars/real_demo/girls');

if (fs.existsSync(demoDir)) {
  const files = fs.readdirSync(demoDir).filter(f => /\.(png|jpe?g|webp|avif|svg)$/i.test(f));
  files.forEach((file, index) => {
    const src = path.join(demoDir, file);
    const destDir = index % 2 === 0 ? boysDir : girlsDir;
    fs.copyFileSync(src, path.join(destDir, file));
  });
  console.log(`Successfully copied ${files.length} demo avatars to real_demo boys and girls folders!`);
} else {
  console.log('Demo directory not found.');
}
