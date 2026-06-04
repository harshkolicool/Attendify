const { JSDOM } = require("jsdom");

const html = `
<!DOCTYPE html>
<html>
<head>
<style>
.hidden-by-search { display: none !important; }
</style>
</head>
<body>
    <section class="admin-group-section" data-search-container="students" data-container-group="AIML A">
        <div class="admin-count-pill" data-container-count="AIML A">2 Students</div>
        <div class="admin-grid" data-search-container="students" data-container-group="AIML A">
            <article class="admin-item-card admin-student-card" data-search-group="students" id="anushka">
                <div class="admin-item-top"></div>
                <div class="admin-student-body"><h4>Anushka</h4></div>
                <details class="admin-edit-box admin-student-edit"><option>ayush</option></details>
            </article>
            <article class="admin-item-card admin-student-card" data-search-group="students" id="arpan">
                <div class="admin-item-top"></div>
                <div class="admin-student-body"><h4>Arpan Sarangi</h4></div>
                <details class="admin-edit-box admin-student-edit"><option>ayush</option></details>
            </article>
            <article class="admin-item-card admin-student-card" data-search-group="students" id="ayush">
                <div class="admin-item-top"></div>
                <div class="admin-student-body"><h4>Ayush Kumar Mishra</h4></div>
                <details class="admin-edit-box admin-student-edit"><option>ayush</option></details>
            </article>
            <article class="admin-item-card admin-student-card" data-search-group="students" id="fourth">
                <div class="admin-item-top"></div>
                <div class="admin-student-body"><h4>Fourth Student</h4></div>
                <details class="admin-edit-box admin-student-edit"><option>ayush</option></details>
            </article>
        </div>
    </section>
</body>
</html>
`;

const dom = new JSDOM(html);
const document = dom.window.document;

function runSearch(query) {
    const targetName = "students";
    const containers = document.querySelectorAll("[data-search-container='" + targetName + "']");
    let visibleContainerCount = 0;

    containers.forEach(function(container) {
        const passesContainerFilter = true;
        const items = container.querySelectorAll("[data-search-group='" + targetName + "']");
        
        items.forEach(function(item) {
            let rawText = "";
            Array.from(item.children).forEach(function(child) {
                if (!child.classList.contains("admin-edit-box")) {
                    rawText += " " + child.textContent;
                }
            });
            const itemText = rawText.toLowerCase();
            const passesText = itemText.includes(query);
            const shouldShow = passesContainerFilter && passesText;

            if (shouldShow) {
                item.classList.remove("hidden-by-search");
            } else {
                item.classList.add("hidden-by-search");
            }
        });

        const visibleItems = container.querySelectorAll(
            "[data-search-group='" + targetName + "']:not(.hidden-by-search)"
        );
        const visibleCount = visibleItems.length;

        if (visibleCount > 0) {
            visibleContainerCount += 1;
            container.classList.remove("hidden-by-search");
        } else {
            container.classList.add("hidden-by-search");
        }

        if (visibleCount === 0) {
            container.style.display = "none";
        } else {
            container.style.display = "";
            const pill = container.querySelector("[data-container-count]");
            if (pill) pill.textContent = visibleCount + " Students";
        }
    });
}

runSearch("ayush");
console.log("Pill Text:", document.querySelector(".admin-count-pill").textContent);
console.log("Anushka has class?", document.getElementById("anushka").classList.contains("hidden-by-search"));
console.log("Arpan has class?", document.getElementById("arpan").classList.contains("hidden-by-search"));
console.log("Ayush has class?", document.getElementById("ayush").classList.contains("hidden-by-search"));
console.log("Fourth has class?", document.getElementById("fourth").classList.contains("hidden-by-search"));
