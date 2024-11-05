// Adds AI-generated tags to the report

module.exports = async function tagReportsAI(report, next) {
  const axios = require("axios");

  try {
    console.log("PreAPI Report", JSON.parse(JSON.stringify(report)));
    const response = await axios.post(
      "http://localhost:8080/twoshotextract",
      JSON.parse(JSON.stringify(report))
    );
    const data = response.data;
    console.log("AI Response", data);

    const aiTags = {};
    const tagNames = [];

    for (const key in data) {
      if (key !== "red_flag") {
        aiTags[key] = data[key];
        tagNames.push(key);
      }
    }
    console.log(aiTags);
    console.log(tagNames);
    report.aitags = aiTags;
    report.aitagnames = tagNames;
    report.red_flag = Boolean(data["red_flag"]);
  } catch (error) {
    // this takes up alot of space
    //console.error("Error fetching AI tags:", error);
    console.error("Error fetching AI tags for: ", report._id)
  }
  finally {
    console.log(report);
    await next();
  }
};