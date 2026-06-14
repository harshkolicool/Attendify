(function () {
    function initMultiSelects() {
        const selects = document.querySelectorAll("select[multiple]");
        selects.forEach(select => {
            if (select.dataset.multiSelectEnhanced) return;
            select.dataset.multiSelectEnhanced = "true";

            // Hide original select
            select.style.display = "none";

            // Create wrapper
            const wrapper = document.createElement("div");
            wrapper.className = "custom-multi-select";
            wrapper.style.position = "relative";
            wrapper.style.width = "100%";

            // Create trigger button
            const trigger = document.createElement("div");
            trigger.className = "custom-multi-select-trigger";
            trigger.innerHTML = `<span class="multi-select-text">Select options...</span><i class="fa-solid fa-angle-down" style="position:absolute; right:14px; color:#64748b; font-size:12px;"></i>`;
            
            // Basic styling for trigger
            trigger.style.height = "48px";
            trigger.style.padding = "0 14px";
            trigger.style.borderRadius = "12px";
            trigger.style.border = "1px solid #d1d5db";
            trigger.style.background = "#ffffff";
            trigger.style.cursor = "pointer";
            trigger.style.display = "flex";
            trigger.style.alignItems = "center";
            trigger.style.color = "#111827";
            trigger.style.fontSize = "14px";
            trigger.style.fontWeight = "600";
            trigger.style.transition = "all 0.2s ease";

            trigger.addEventListener("mouseenter", () => {
                if (menu.style.display !== "block") {
                    trigger.style.borderColor = "#a5b4fc";
                    trigger.style.boxShadow = "0 2px 4px rgba(79, 70, 229, 0.05)";
                }
            });
            trigger.addEventListener("mouseleave", () => {
                if (menu.style.display !== "block") {
                    trigger.style.borderColor = "#d1d5db";
                    trigger.style.boxShadow = "none";
                }
            });
            
            // Create dropdown menu
            const menu = document.createElement("div");
            menu.className = "custom-multi-select-menu";
            menu.style.position = "absolute";
            menu.style.top = "100%";
            menu.style.left = "0";
            menu.style.width = "100%";
            menu.style.background = "#ffffff";
            menu.style.border = "1px solid #d1d5db";
            menu.style.borderRadius = "12px";
            menu.style.marginTop = "8px";
            menu.style.maxHeight = "250px";
            menu.style.overflowY = "auto";
            menu.style.zIndex = "1000";
            menu.style.display = "none";
            menu.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1)";

            // Build options based on original select
            function updateMenu() {
                menu.innerHTML = "";
                let selectedCount = 0;
                let firstSelectedText = "";

                Array.from(select.options).forEach(option => {
                    if (option.hidden || option.disabled || option.value === "") return;
                    
                    if (option.selected) {
                        selectedCount++;
                        if (selectedCount === 1) firstSelectedText = option.text;
                    }

                    const item = document.createElement("div");
                    item.style.padding = "12px 16px";
                    item.style.cursor = "pointer";
                    item.style.display = "flex";
                    item.style.alignItems = "center";
                    item.style.gap = "12px";
                    item.style.borderBottom = "1px solid #f3f4f6";
                    item.style.transition = "background-color 0.15s ease";

                    item.addEventListener("mouseenter", () => item.style.backgroundColor = "#f8fafc");
                    item.addEventListener("mouseleave", () => item.style.backgroundColor = "transparent");

                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.checked = option.selected;
                    checkbox.style.cursor = "pointer";
                    checkbox.style.width = "16px";
                    checkbox.style.height = "16px";
                    checkbox.style.margin = "0";
                    checkbox.style.padding = "0";
                    checkbox.style.flexShrink = "0";
                    checkbox.style.accentColor = "#4f46e5";
                    checkbox.style.borderRadius = "4px";
                    
                    const label = document.createElement("span");
                    label.textContent = option.text;
                    label.style.fontSize = "14px";
                    label.style.lineHeight = "1.2";
                    label.style.color = "#374151";

                    item.appendChild(checkbox);
                    item.appendChild(label);

                    item.addEventListener("click", (e) => {
                        e.stopPropagation();
                        option.selected = !option.selected;
                        checkbox.checked = option.selected;
                        // Trigger change event on original select
                        select.dispatchEvent(new Event("change"));
                        updateMenu();
                    });

                    menu.appendChild(item);
                });

                // Update trigger text
                const textSpan = trigger.querySelector(".multi-select-text");
                if (selectedCount === 0) {
                    textSpan.textContent = "Select Teachers";
                    textSpan.style.color = "#9ca3af";
                } else if (selectedCount === 1) {
                    textSpan.textContent = firstSelectedText;
                    textSpan.style.color = "#111827";
                } else {
                    textSpan.textContent = `${selectedCount} Teachers Selected`;
                    textSpan.style.color = "#4f46e5";
                }
            }

            updateMenu();

            // Toggle menu
            trigger.addEventListener("click", (e) => {
                e.stopPropagation();
                const isShowing = menu.style.display === "block";
                document.querySelectorAll(".custom-multi-select-menu").forEach(m => m.style.display = "none");
                document.querySelectorAll(".custom-multi-select-trigger").forEach(t => {
                    t.style.borderColor = "#d1d5db";
                    t.style.boxShadow = "none";
                });
                
                if (isShowing) {
                    menu.style.display = "none";
                    trigger.style.borderColor = "#d1d5db";
                    trigger.style.boxShadow = "none";
                } else {
                    menu.style.display = "block";
                    trigger.style.borderColor = "#4f46e5";
                    trigger.style.boxShadow = "0 0 0 3px rgba(79, 70, 229, 0.1)";
                    // Remove bottom border from last item
                    if (menu.lastElementChild) {
                        menu.lastElementChild.style.borderBottom = "none";
                    }
                }
            });

            // Close when clicking outside
            document.addEventListener("click", () => {
                menu.style.display = "none";
                trigger.style.borderColor = "#d1d5db";
                trigger.style.boxShadow = "none";
            });

            // Listen for external changes to the original select
            select.addEventListener("change", updateMenu);

            // Re-render when original select options are modified (e.g. by filtering)
            const observer = new MutationObserver(updateMenu);
            observer.observe(select, { childList: true, attributes: true, subtree: true });

            wrapper.appendChild(trigger);
            wrapper.appendChild(menu);
            select.parentNode.insertBefore(wrapper, select.nextSibling);
        });
    }

    // Initialize on load
    document.addEventListener("DOMContentLoaded", initMultiSelects);
})();
