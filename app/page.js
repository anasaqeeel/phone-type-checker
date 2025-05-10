import { useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { Upload, FileUp, Download, Loader2, Phone, CheckCircle, AlertCircle } from "lucide-react";

// Clean number: remove everything except digits and ensure +1 prefix
const cleanNumber = (number) => {
  if (!number) return null;
  number = String(number).replace(/[^\d]/g, "");
  if (number.length >= 10) {
    if (!number.startsWith("1")) {
      number = "1" + number;
    }
    return `+${number}`;
  }
  return null;
};

// Detect if a column is likely to contain phone numbers
const isPhoneColumn = (column) => {
  const matchCount = column.filter((value) => {
    const cleaned = cleanNumber(value);
    return cleaned && cleaned.length >= 10;
  }).length;
  return matchCount / column.length > 0.5;
};

export default function Home() {
  const [tab, setTab] = useState("single");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [singleResult, setSingleResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [file, setFile] = useState(null);
  const [processedData, setProcessedData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    console.log("File selected:", selectedFile ? selectedFile.name : "None");
    setFile(selectedFile || null);
    setErrorMessage(null);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      console.log("File dropped:", e.dataTransfer.files[0].name);
      setFile(e.dataTransfer.files[0]);
      setErrorMessage(null);
    }
  };

  const handleValidateSingle = async () => {
    if (!phoneNumber) {
      setSingleResult({ success: false, valid: false, line_type: "invalid", error: "Please enter a phone number" });
      return;
    }
    const cleaned = cleanNumber(phoneNumber);
    if (!cleaned) {
      setSingleResult({ success: false, valid: false, line_type: "invalid", error: "Invalid phone number format" });
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/validate-number?number=${cleaned}`);
      const result = await response.json();
      setSingleResult(result);
      if (!result.success) {
        setErrorMessage(result.error || "Failed to validate number");
      }
    } catch (error) {
      setSingleResult({ success: false, valid: false, line_type: "invalid", error: "Network error" });
      setErrorMessage("Network error");
    }
    setIsValidating(false);
  };

  const handleProcessFile = async () => {
    if (!file) {
      setErrorMessage("Please select a file to process");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    let reader = new FileReader();
    reader.onload = async (event) => {
      const data = event.target.result;
      let parsedData = [];

      if (file.name.endsWith(".xlsx")) {
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        parsedData = XLSX.utils.sheet_to_json(sheet);
      } else if (file.name.endsWith(".csv")) {
        Papa.parse(data, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            parsedData = result.data;
          },
        });
      }

      if (parsedData.length === 0) {
        setErrorMessage("Invalid file format or empty file");
        setIsProcessing(false);
        return;
      }

      const potentialColumns = Object.keys(parsedData[0]).filter((column) => {
        const columnData = parsedData.map((row) => row[column]);
        return isPhoneColumn(columnData);
      });
      console.log("Potential phone columns:", potentialColumns);

      const phoneNumbers = [];
      for (let row of parsedData) {
        for (let column of potentialColumns) {
          const cleaned = cleanNumber(row[column]);
          if (cleaned && !phoneNumbers.includes(cleaned)) {
            phoneNumbers.push(cleaned);
          }
        }
      }

      let validationResults = [];
      try {
        const response = await fetch("/api/validate-numbers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numbers: phoneNumbers }),
        });
        const result = await response.json();
        validationResults = result.results || [];
      } catch (error) {
        validationResults = phoneNumbers.map((number) => ({
          number,
          valid: false,
          line_type: "invalid",
          error: "Network error",
        }));
      }

      const updatedData = parsedData.map((row) => {
        let foundMobile = null;
        let lineType = "Invalid";
        let error = null;
        for (let column of potentialColumns) {
          const cleaned = cleanNumber(row[column]);
          if (cleaned) {
            const result = validationResults.find((r) => r.number === cleaned);
            if (result) {
              if (result.valid) {
                lineType = result.line_type.charAt(0).toUpperCase() + result.line_type.slice(1);
                if (result.line_type === "mobile") {
                  foundMobile = cleaned;
                }
              } else {
                lineType = "Invalid";
                error = result.error || "Validation failed";
              }
              break;
            }
          }
        }
        return { ...row, "Valid Mobile Number": foundMobile || "Not Found", "Line Type": lineType, "Error": error || "" };
      });

      const hasErrors = validationResults.some((r) => !r.valid);
      if (hasErrors) {
        setErrorMessage("Some numbers could not be validated due to API issues. Check the output file for details.");
      }

      setProcessedData(updatedData);
      setIsProcessing(false);
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadFile = () => {
    if (processedData.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(processedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Processed Data");
    XLSX.writeFile(workbook, `processed_${file.name}`);
  };

  const renderResultCard = (result) => {
    if (!result) return null;

    const isMobile = result.valid && result.line_type === "mobile";
    const isLandline = result.valid && result.line_type === "landline";
    const isInvalid = !result.valid || result.line_type === "invalid";

    return (
      <div
        className={`p-4 rounded-lg shadow-sm border ${isMobile
            ? "bg-green-50 border-green-200"
            : isLandline
              ? "bg-yellow-50 border-yellow-200"
              : "bg-red-50 border-red-200"
          }`}
      >
        <div className="flex items-center space-x-2">
          {isMobile && <CheckCircle className="h-5 w-5 text-green-600" />}
          {isLandline && <Phone className="h-5 w-5 text-yellow-600" />}
          {isInvalid && <AlertCircle className="h-5 w-5 text-red-600" />}
          <h3 className="text-sm font-semibold">
            {isMobile
              ? "Valid Mobile Number"
              : isLandline
                ? "Valid Landline Number"
                : result.error || "Invalid Number"}
          </h3>
        </div>
        <div className="mt-2 space-y-1 text-xs text-gray-600">
          <p><span className="font-medium">Number:</span> {result.number || "N/A"}</p>
          <p><span className="font-medium">Line Type:</span> {result.line_type ? result.line_type.charAt(0).toUpperCase() + result.line_type.slice(1) : "N/A"}</p>
          <p><span className="font-medium">Carrier:</span> {result.carrier || "N/A"}</p>
          <p><span className="font-medium">Location:</span> {result.location || "N/A"}</p>
          <p><span className="font-medium">Country:</span> {result.country || "N/A"}</p>
        </div>
      </div>
    );
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gray-50">
      <div className="w-full max-w-md p-4 sm:p-6 space-y-6 bg-white rounded-xl shadow-md">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold">Phone Number Validator</h1>
          <p className="text-sm sm:text-base text-gray-500 mt-2">
            Check if a number is mobile or landline, or upload a file to process multiple numbers
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
            <p className="text-sm text-red-700 font-medium">{errorMessage}</p>
          </div>
        )}

        <div className="flex justify-center space-x-4">
          <button
            className={`px-4 py-2 text-sm font-medium rounded-md ${tab === "single" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"
              }`}
            onClick={() => setTab("single")}
          >
            Validate Single Number
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium rounded-md ${tab === "file" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"
              }`}
            onClick={() => setTab("file")}
          >
            Upload File
          </button>
        </div>

        {tab === "single" ? (
          <div className="space-y-4">
            <div className="flex items-center border rounded-lg p-2 bg-gray-50">
              <Phone className="h-5 w-5 text-gray-500 mr-2" />
              <input
                type="text"
                placeholder="Enter phone number (e.g., +14155552671)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full outline-none text-sm bg-transparent"
              />
            </div>
            <button
              onClick={handleValidateSingle}
              disabled={isValidating}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-md flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                "Validate Number"
              )}
            </button>
            {renderResultCard(singleResult)}
          </div>
        ) : (
          <>
            {!processedData.length ? (
              <>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 sm:p-8 text-center ${dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
                    }`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="p-3 rounded-full bg-blue-100">
                      <Upload className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Drag and drop your file here or click to browse
                      </p>
                      <p className="text-xs text-gray-500 hidden sm:block">
                        Supports .xlsx and .csv files
                      </p>
                    </div>
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <input
                        id="file-upload"
                        type="file"
                        className="sr-only"
                        accept=".xlsx,.csv"
                        onChange={handleFileChange}
                      />
                      <button
                        type="button"
                        className="px-4 py-2 border text-sm rounded-md flex items-center gap-2 bg-gray-50 hover:bg-gray-100"
                      >
                        <FileUp className="h-4 w-4" />
                        Browse Files
                      </button>
                    </label>
                  </div>
                </div>

                {file && (
                  <div className="space-y-4">
                    <div className="p-3 border rounded-lg bg-gray-50">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                    </div>
                    <button
                      onClick={handleProcessFile}
                      disabled={isProcessing}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-md flex justify-center items-center gap-2 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        "Process File"
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                  <p className="text-sm text-green-700 font-medium">File processed successfully!</p>
                </div>
                <button
                  className="w-full bg-green-600 hover:bg-green-700 text-white text-sm py-2 rounded-md flex items-center justify-center gap-2"
                  onClick={handleDownloadFile}
                >
                  <Download className="h-4 w-4" />
                  Download Processed File
                </button>
                <button
                  onClick={() => {
                    setProcessedData([]);
                    setFile(null);
                    setErrorMessage(null);
                  }}
                  className="w-full border text-sm py-2 rounded-md hover:bg-gray-100"
                >
                  Process Another File
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}