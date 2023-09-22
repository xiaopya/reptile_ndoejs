const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

/**
 * 定义非法字符的正则表达式
 * 替换非法字符为空格
 * @param {string} folderName
 * @returns
 */
function sanitizeFolderName(folderName) {
  const illegalCharsRegex = /[<>:"|?*\\\/]/g;
  const sanitizedFolderName = folderName.replace(illegalCharsRegex, " ");
  return sanitizedFolderName;
}

(async () => {
  // 使用readline模块获取终端输入的网址
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("请输入网址：", async (address) => {
    rl.close();

    console.log("正在获取中...");

    // 创建浏览器实例并打开空白页面
    const browser = await puppeteer.launch({
      headless: "new",
      ignoreHTTPSErrors: true,
    });
    const page = await browser.newPage();

    let totalRequests = 0; // 记录接口响应次数
    let totalImages = 0; // 记录图片数量
    const requests = []; // 监听页面请求和响应
    const _img = []; // 处理图片
    let startTimestamp;

    page.on("request", (request) => {
      try {
        if (request.resourceType() !== "xhr") return;
        if (!startTimestamp) startTimestamp = new Date().getTime();
        totalRequests++;
        requests.push({
          ...request,
          name: request.url(),
          type: request.resourceType(),
          startTime: new Date().getTime() - startTimestamp,
        });
      } catch {}
    });

    const decoder = new TextDecoder("utf-8");
    page.on("response", async (response) => {
      try {
        const request = response.request();
        const contentType = response.headers()["content-type"];
        const buffer = await response.buffer();
        const getType = {
          image: contentType?.includes("image"),
          text: contentType?.includes("text"),
          json: contentType?.includes("json"),
        };
        // 将图片和文本分开处理，因为图片直接存储会出现乱码现象
        if (getType.image) {
          totalImages++;
          const extension = contentType.split("/")[1]; // 获取图片的扩展名
          const fileName = `${totalImages}.${extension}`; // 自定义输出文件名

          _img.push({
            fileName,
            buffer,
          });
        } else if (getType.text || getType.json) {
          // 处理文本数据
          const responseData = decoder.decode(buffer);
          const matchedRequest = requests.find(
            (req) => req.name === request.url()
          );
          if (matchedRequest) {
            matchedRequest.responseData = responseData;
          }
        }
      } catch (err) {
        console.log(err);
      }
    });

    try {
      // 跳转到输入的地址
      await page.goto(address, { waitUntil: "networkidle0", timeout: 60000 });
    } catch (error) {
      throw new Error("Navigation timeout occurred");
    }

    // 获取接口信息及返回数据
    const interfaceData = [];
    requests.forEach((request) => {
      interfaceData.push(request);
    });

    // 获取网页标题
    const title = await page.title();
    // 创建存储json和图片的文件夹，文件名称采用网站标题
    const _t = title ? sanitizeFolderName(title) : +new Date();
    const filename = `info/${_t}`;
    const ipath = `info/${_t}/imgs`;
    
    try {
      if (!fs.existsSync(filename)) {
        fs.mkdirSync(filename, { recursive: true });
      }
      if (!fs.existsSync(ipath)) {
        fs.mkdirSync(ipath, { recursive: true });
      }

      // 将接口信息保存为JSON文件,并写入
      const timestamp = new Date().getTime();
      fs.writeFileSync(
        `${filename}/${timestamp}.json`,
        JSON.stringify(interfaceData, null, 2)
      );
      _img.forEach((imgs) => {
        fs.writeFileSync(`${filename}/imgs/${imgs.fileName}`, imgs.buffer);
      });
    } catch (err) {
      console.error(err);
    }

    console.log(`接口信息已保存到${filename}`);
    console.log(
      `所有请求已完成，共收集到${totalRequests}个响应，${totalImages}张图片资源。`
    );

    // 关闭浏览器
    await browser.close();
  });
})();
