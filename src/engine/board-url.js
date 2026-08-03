// 全球排行榜的倉庫位址(jsonblob 匿名 JSON 儲存)。
// 獨立成一個檔案是給 .github/workflows/keepalive.yml 用的:
// 倉庫要是過期(一天沒人碰就會),排程會自動開新倉庫、
// 從備份還原,然後改寫這一行——所以這個網址格式不要動。
export const BOARD_URL = 'https://jsonblob.com/api/jsonBlob/019fc658-2b33-7d4d-b6ce-f2311b373d80';
