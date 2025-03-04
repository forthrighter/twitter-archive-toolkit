// Given a twitter zip, converts it to one JSON file to match the one generated by community-archive
import unzipper from 'unzipper'
import * as fs from 'fs'
import path from 'path'
import readline from 'readline'
import zlib from 'zlib'
import util from 'util'
const gzip = util.promisify(zlib.gzip);

export async function processArchive(archivePath) {
    // .data/temp/archive.zip
    const outDirectory = path.dirname(archivePath)
    const directory = await unzipper.Open.file(archivePath);
    const filesToExtract = [
        'account.js', 'tweets.js', 'like.js', 'following.js', 'follower.js', 'profile.js'
    ]
    const filePaths = []
    for (let file of directory.files) {
        if (matchesFileToExtract(file.path, filesToExtract)) {
            const outPath = `${outDirectory}/${file.path}`.replace('.js', '.json')
            filePaths.push(outPath)
            await streamFileToDisk(file, outPath)
            await modifyFirstLine(outPath, () => { return '['})
        }
    }    

    // Remove email from account.json
    const accountFilePath =  `${outDirectory}/data/account.json`
    console.log("Reading account file", accountFilePath)
    const accountData = JSON.parse(await fs.promises.readFile(accountFilePath, 'utf8'));
    delete accountData[0].account.email
    delete accountData[0].account.createdVia
    console.log("Writing account file path",accountFilePath)
    await fs.promises.writeFile(accountFilePath, JSON.stringify(accountData, null, 2), 'utf8');

    // Combine it all into one json
    combineJsonFilesSync(`${outDirectory}/data/`, `${outDirectory}/${accountData[0].account.username}.json`)
}   

export async function moveFilesRecursively(sourceDir, targetDir) {
  try {
    // Ensure the target directory exists
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Read all the entries in the source directory
    const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively move subdirectory
        await moveFilesRecursively(sourcePath, targetDir);
      } else if (entry.isFile()) {
        // Move the file
        await fs.promises.cp(sourcePath, targetPath);
      }
    }

  } catch (err) {
    console.error('Error moving files:', err);
    throw err;  // Rethrow or handle error as needed
  }
}


async function modifyFirstLine(filePath, modifyFunction) {
    // Step 1: Read the first line
    const inputStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: inputStream,
        crlfDelay: Infinity
    });

    let firstLine = '';
    for await (const line of rl) {
        firstLine = line;  // Store the first line
        rl.close();  // Close the stream after reading the first line
        break;
    }

    inputStream.close()

    // Step 2: Modify the first line
    const modifiedFirstLine = modifyFunction(firstLine);

    // Step 3: Write the modified line and the rest of the file
    let fileContent = fs.readFileSync(filePath, 'utf8'); // Read the entire file into memory
    const endOfFirstLine = fileContent.indexOf('\n') + 1; // Find the end of the first line
    fileContent = modifiedFirstLine + fileContent.slice(endOfFirstLine); // Replace the first line

    fs.writeFileSync(filePath, fileContent, 'utf8'); // Write the modified content back to the file
}
function matchesFileToExtract(filePath, filesToExtract) {
    const fileName = path.basename(filePath);
    return filesToExtract.includes(fileName);
}
function streamFileToDisk(file, outputPath) {
    return new Promise((resolve, reject) => {
        // Extract directory path from outputPath
        const directory = path.dirname(outputPath);

        // Ensure directory exists or create it
        fs.mkdir(directory, { recursive: true }, (err) => {
            if (err) {
                return reject(err);
            }

            const fileStream = file.stream();  // Assume 'file.stream()' returns a readable stream
            const outputStream = fs.createWriteStream(outputPath);

            fileStream.pipe(outputStream)
                .on('error', (error) => {
                    console.error('Error while streaming file:', error);
                    reject(error);
                })
                .on('finish', () => {
                    resolve();
                });
        });
    });
}

// Function to read and combine JSON files synchronously
function combineJsonFilesSync(directory, outputFile) {
    const combinedData = {};

    try {
        // Read all files in the directory
        const files = fs.readdirSync(directory);

        // Filter out non-json files
        const jsonFiles = files.filter(file => path.extname(file) === '.json');

        // Read each JSON file and add it to the combined object
        jsonFiles.forEach(file => {
            const filePath = path.join(directory, file);
            const fileNameWithoutExt = path.basename(file, '.json');

            const fileContents = fs.readFileSync(filePath, 'utf-8');
            combinedData[fileNameWithoutExt] = JSON.parse(fileContents);
        });

        // Write the combined object to the output file
        fs.writeFileSync(outputFile, JSON.stringify(combinedData, null, 2));
        console.log(`Combined JSON has been written to ${outputFile}`);
    } catch (err) {
        console.error(`Error: ${err}`);
    }
}

run()
async function run() {
    const archivePath = 'data/defenderofbasic.zip'
    await processArchive(archivePath)
    // await fs.promises.rm(archivePath, { recursive: true, force: true });
}