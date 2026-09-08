/**
 * متجر شذى للهدايا والزهور المصنوعة يدوياً (SHATHA)
 * تطبيق جافاسكريبت متكامل لإدارة السلة والمنتجات المصنوعة يدوياً (ورد ستان، بوكيهات فلوس، بوكيهات حلوى)
 * مع خاصية الطلب المباشر عبر واتساب لكل منتج داخل السلة
 * رقم الواتساب الرسمي: 01102541236 (+201102541236)
 */

const SHATHA_CONFIG = {
  storeName: "شذى للهدايا والورد المصنوع يدوياً",
  whatsappNumber: "201102541236", // 01102541236
  defaultCoupon: "SHATHA10",
  discountPercent: 10,
  freeShippingThreshold: 1000,
  currency: "ج.م"
};

// حالة التطبيق
let appState = {
  products: typeof SHATHA_PRODUCTS !== 'undefined' ? SHATHA_PRODUCTS : [],
  shippingZones: typeof SHATHA_SHIPPING_ZONES !== 'undefined' ? SHATHA_SHIPPING_ZONES : [],
  searchQuery: "",
  sortBy: "default",
  selectedProduct: null,
  selectedSize: "standard",
  cart: [],
  appliedCoupon: null,
  selectedShippingZone: "cairo",
  giftCard: {
    enabled: false,
    message: ""
  },
  selectedPaymentMethod: "cod"
};

// تحميل السلة من المتصفح
function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('shatha_cart_items');
    if (saved) {
      appState.cart = JSON.parse(saved);
    }
    const savedCoupon = localStorage.getItem('shatha_applied_coupon');
    if (savedCoupon) {
      appState.appliedCoupon = savedCoupon;
    }
  } catch (e) {
    console.warn("Error loading cart", e);
  }
}

// حفظ السلة
function saveCartToStorage() {
  try {
    localStorage.setItem('shatha_cart_items', JSON.stringify(appState.cart));
    if (appState.appliedCoupon) {
      localStorage.setItem('shatha_applied_coupon', appState.appliedCoupon);
    } else {
      localStorage.removeItem('shatha_applied_coupon');
    }
  } catch (e) {
    console.warn("Error saving cart", e);
  }
}

// بدء التشغيل
document.addEventListener("DOMContentLoaded", () => {
  loadCartFromStorage();
  renderProducts();
  updateCartUI();
  setupEventListeners();
  setupShippingDropdown();
});

// إعداد المستمعين
function setupEventListeners() {
  // شريط التمرير
  window.addEventListener("scroll", () => {
    const header = document.querySelector(".main-header");
    if (window.scrollY > 40) {
      header?.classList.add("scrolled");
    } else {
      header?.classList.remove("scrolled");
    }
  });

  // قائمة الموبايل
  const mobileToggle = document.getElementById("mobileToggle");
  const navMenu = document.getElementById("navMenu");
  mobileToggle?.addEventListener("click", () => {
    navMenu?.classList.toggle("active");
  });

  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      navMenu?.classList.remove("active");
    });
  });

  // أزرار السلة
  document.getElementById("cartTriggerBtn")?.addEventListener("click", openCartDrawer);
  document.getElementById("closeDrawerBtn")?.addEventListener("click", closeCartDrawer);

  // إغلاق المودالات
  document.getElementById("modalBackdrop")?.addEventListener("click", () => {
    closeAllModals();
  });

  // البحث الفوري
  const searchInput = document.getElementById("productSearchInput");
  searchInput?.addEventListener("input", (e) => {
    appState.searchQuery = e.target.value.trim().toLowerCase();
    renderProducts();
  });

  // الترتيب
  const sortSelect = document.getElementById("sortSelect");
  sortSelect?.addEventListener("change", (e) => {
    appState.sortBy = e.target.value;
    renderProducts();
  });

  // نسخ كود الخصم
  document.getElementById("couponPill")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(SHATHA_CONFIG.defaultCoupon);
    showToast(`تم نسخ كود الخصم (${SHATHA_CONFIG.defaultCoupon}) بنجاح! 🎉`, "success");
    applyCouponCode(SHATHA_CONFIG.defaultCoupon);
  });

  // تطبيق الكوبون
  document.getElementById("applyCouponBtn")?.addEventListener("click", () => {
    const code = document.getElementById("couponInput")?.value.trim();
    if (code) {
      applyCouponCode(code);
    }
  });

  // كارت الإهداء
  const giftCheckbox = document.getElementById("giftCardToggle");
  giftCheckbox?.addEventListener("change", (e) => {
    appState.giftCard.enabled = e.target.checked;
    const msgBox = document.getElementById("giftCardMsgWrapper");
    if (msgBox) {
      msgBox.style.display = e.target.checked ? "block" : "none";
    }
  });

  // موافق على الطلب والانتقال لصفحة الدفع المخصصة checkout.html
  document.getElementById("proceedCheckoutBtn")?.addEventListener("click", () => {
    if (appState.cart.length === 0) {
      showToast("سلة المشتريات فارغة! يرجى اختيار باقة أولاً", "error");
      return;
    }
    window.location.href = "checkout.html";
  });

  // إرسال كامل السلة عبر واتساب مباشرة
  document.getElementById("cartDirectWhatsappBtn")?.addEventListener("click", () => {
    sendFullCartDirectToWhatsapp();
  });

  // إغلاق مودالات
  document.getElementById("closeProductModal")?.addEventListener("click", closeProductModal);
  document.getElementById("closeCheckoutModal")?.addEventListener("click", closeCheckoutModal);

  // طرق الدفع
  document.querySelectorAll(".payment-option-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".payment-option-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      appState.selectedPaymentMethod = card.getAttribute("data-method");
    });
  });

  // تغيير المحافظة
  document.getElementById("checkoutGovernorate")?.addEventListener("change", (e) => {
    appState.selectedShippingZone = e.target.value;
    updateCheckoutSummary();
  });

  // تأكيد الطلب
  document.getElementById("confirmOrderBtn")?.addEventListener("click", handleCheckoutSubmit);

  // النشرة البريدية
  document.getElementById("newsletterForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    showToast("شكراً لانضمامك لعائلة شذى! تم حفظ بياناتك لعروضنا القادمة.", "success");
    document.getElementById("newsletterEmail").value = "";
  });
}

// رسم جميع المنتجات في شبكة موحدة بدون فئات
function renderProducts() {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  let filtered = [...appState.products];

  // فلتر البحث بالاسم أو الوصف أو الخامات
  if (appState.searchQuery) {
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(appState.searchQuery) ||
      p.shortDesc.toLowerCase().includes(appState.searchQuery) ||
      (p.materials && p.materials.toLowerCase().includes(appState.searchQuery))
    );
  }

  // الترتيب
  if (appState.sortBy === "price-low") {
    filtered.sort((a, b) => a.basePrice - b.basePrice);
  } else if (appState.sortBy === "price-high") {
    filtered.sort((a, b) => b.basePrice - a.basePrice);
  } else if (appState.sortBy === "rating") {
    filtered.sort((a, b) => b.rating - a.rating);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <i class="fas fa-search" style="font-size: 3rem; color: var(--primary-pink); margin-bottom: 15px; opacity: 0.6;"></i>
        <h3 style="color: var(--primary-dark); margin-bottom: 8px;">لم نجد نتائج مطابقة لبحثك</h3>
        <p style="color: var(--text-muted);">جرب البحث بكلمات أخرى مثل "ستان" أو "فلوس" أو "حلوى".</p>
        <button class="btn-primary" style="margin-top: 20px;" onclick="document.getElementById('productSearchInput').value=''; appState.searchQuery=''; renderProducts();">عرض جميع المنتجات</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(product => {
    const discountPercent = product.oldPrice ? Math.round(((product.oldPrice - product.basePrice) / product.oldPrice) * 100) : null;
    const badgeText = product.tag || (discountPercent ? `خصم ${discountPercent}%` : null);

    return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-thumb-wrap" onclick="openProductModal('${product.id}')">
          <img src="${product.images[0]}" alt="${product.name}" class="product-img" loading="lazy">
          ${badgeText ? `<span class="product-badge">${badgeText}</span>` : ''}
          <button class="quick-view-overlay-btn" type="button">
            <i class="fas fa-eye"></i> تفاصيل الباقة والزوايا (${product.images.length} صور)
          </button>
        </div>
        
        <div class="product-info">
          <h3 class="product-title" onclick="openProductModal('${product.id}')">${product.name}</h3>
          
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 10px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${product.shortDesc}
          </p>

          <div class="product-rating">
            <span>★</span>
            <strong>${product.rating}</strong>
            <span class="reviews-count">(${product.reviewsCount} تقييم حقيقي)</span>
          </div>

          <div class="product-price-row">
            <span class="current-price">${product.basePrice} <span class="currency">ج.م</span></span>
            ${product.oldPrice ? `<span class="old-price">${product.oldPrice} ج.م</span>` : ''}
          </div>

          <div class="product-card-actions">
            <button class="btn-add-cart" onclick="quickAddToCart('${product.id}')">
              <i class="fas fa-shopping-bag"></i> أضف للسلة
            </button>
            <a href="https://wa.me/${SHATHA_CONFIG.whatsappNumber}?text=${encodeURIComponent(`مرحباً شذى 🌸 أود الاستفسار والطلب المباشر لباقة: ${product.name} (السعر: ${product.basePrice} ج.م)`)}" 
               target="_blank" 
               class="btn-whatsapp-direct" 
               title="طلب مباشر وسريع عبر واتساب">
              <i class="fab fa-whatsapp"></i>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// إضافة سريعة بالحجم الأساسي للسلة
function quickAddToCart(productId) {
  const product = appState.products.find(p => p.id === productId);
  if (!product) return;

  const defaultSize = product.sizes[0];
  addToCart(product, defaultSize, 1);
  showToast(`تمت إضافة "${product.name}" إلى سلتك 🌸`, "success");
}

// فتح نافذة تفاصيل المنتج المتقدمة
function openProductModal(productId) {
  const product = appState.products.find(p => p.id === productId);
  if (!product) return;

  appState.selectedProduct = product;
  appState.selectedSize = product.sizes[0].id;

  const modal = document.getElementById("productDetailsModal");
  const backdrop = document.getElementById("modalBackdrop");

  // تجهيز معرض الصور والزوايا
  const mainImg = document.getElementById("modalMainImg");
  const thumbsContainer = document.getElementById("modalThumbnailsContainer");

  if (mainImg) mainImg.src = product.images[0];

  if (thumbsContainer) {
    if (product.images.length > 1) {
      thumbsContainer.style.display = "flex";
      thumbsContainer.innerHTML = product.images.map((img, idx) => `
        <div class="modal-thumb ${idx === 0 ? 'active' : ''}" onclick="switchModalImage('${img}', this)">
          <img src="${img}" alt="زاوية ${idx + 1}">
        </div>
      `).join('');
    } else {
      thumbsContainer.style.display = "none";
    }
  }

  // ملء النصوص والبيانات
  document.getElementById("modalProductTitle").innerText = product.name;
  document.getElementById("modalProductRating").innerText = product.rating;
  document.getElementById("modalProductReviewsCount").innerText = `(${product.reviewsCount} تقييم)`;
  document.getElementById("modalProductDesc").innerText = product.shortDesc;

  // الخامات والتصنيع
  const materialsBox = document.getElementById("modalMaterialsText");
  if (materialsBox && product.materials) {
    materialsBox.innerText = product.materials;
  }
  const craftBox = document.getElementById("modalCraftText");
  if (craftBox && product.craftsmanship) {
    craftBox.innerText = product.craftsmanship;
  }

  // محدد الأحجام والمقاسات
  renderModalSizes(product);
  updateModalPrice(product);

  // الميزات والضمانات
  const advList = document.getElementById("modalAdvantagesList");
  if (advList && product.advantages) {
    advList.innerHTML = product.advantages.map(adv => `<li>${adv}</li>`).join('');
  }

  // تقييمات العملاء
  renderModalReviews(product);

  // زر الواتساب المباشر للباقة المحددة
  const waBtn = document.getElementById("modalWhatsappBtn");
  if (waBtn) {
    waBtn.onclick = () => {
      const selectedSizeObj = product.sizes.find(s => s.id === appState.selectedSize) || product.sizes[0];
      const msg = `مرحباً فريق شذى 🌸 أرغب في طلب هذه الباقة:\n- الباقة: ${product.name}\n- المقاس/التنسيق: ${selectedSizeObj.name}\n- السعر: ${selectedSizeObj.price} ج.م\n- التفاصيل: ${selectedSizeObj.desc}\n- الرابط: ${window.location.href}`;
      window.open(`https://wa.me/${SHATHA_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank');
    };
  }

  // زر الإضافة للسلة من داخل المودال
  const addBtn = document.getElementById("modalAddToCartBtn");
  if (addBtn) {
    addBtn.onclick = () => {
      const selectedSizeObj = product.sizes.find(s => s.id === appState.selectedSize) || product.sizes[0];
      addToCart(product, selectedSizeObj, 1);
      showToast(`تمت إضافة "${product.name} - ${selectedSizeObj.name}" للسلة!`, "success");
      closeProductModal();
      openCartDrawer();
    };
  }

  backdrop?.classList.add("active");
  modal?.classList.add("active");
  document.body.style.overflow = "hidden";
}

// تبديل زوايا وصور المعرض
function switchModalImage(imgSrc, thumbElement) {
  const mainImg = document.getElementById("modalMainImg");
  if (mainImg) mainImg.src = imgSrc;

  document.querySelectorAll(".modal-thumb").forEach(t => t.classList.remove("active"));
  thumbElement.classList.add("active");
}

// رسم خيارات الأحجام
function renderModalSizes(product) {
  const container = document.getElementById("modalSizesContainer");
  if (!container) return;

  container.innerHTML = product.sizes.map(size => `
    <div class="size-radio-option ${appState.selectedSize === size.id ? 'selected' : ''}" 
         onclick="selectModalSize('${size.id}')">
      <div class="size-info">
        <h6>${size.name}</h6>
        <p>${size.stems} • ${size.sizeLabel} • ${size.desc}</p>
      </div>
      <span class="size-price-tag">${size.price} ج.م</span>
    </div>
  `).join('');
}

function selectModalSize(sizeId) {
  appState.selectedSize = sizeId;
  if (appState.selectedProduct) {
    renderModalSizes(appState.selectedProduct);
    updateModalPrice(appState.selectedProduct);
  }
}

function updateModalPrice(product) {
  const sizeObj = product.sizes.find(s => s.id === appState.selectedSize) || product.sizes[0];
  const priceElem = document.getElementById("modalCurrentPrice");
  if (priceElem) {
    priceElem.innerHTML = `${sizeObj.price} <span class="currency">ج.م</span>`;
  }
}

function renderModalReviews(product) {
  const container = document.getElementById("modalReviewsList");
  if (!container) return;

  if (!product.reviews || product.reviews.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">كن أول من يقيّم هذه الباقة المصنوعة يدوياً!</p>`;
    return;
  }

  container.innerHTML = product.reviews.map(rev => `
    <div style="background: var(--bg-body); padding: 12px 16px; border-radius: var(--radius-md); margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong style="color: var(--text-main); font-size: 0.9rem;">${rev.author}</strong>
        <span style="color: #F5A623; font-size: 0.85rem;">★ ${rev.rating}</span>
      </div>
      <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.6;">${rev.comment}</p>
      <small style="color: var(--text-light); font-size: 0.75rem;">${rev.date}</small>
    </div>
  `).join('');
}

function closeProductModal() {
  const modal = document.getElementById("productDetailsModal");
  modal?.classList.remove("active");
  if (!document.querySelector(".cart-drawer.active") && !document.querySelector(".checkout-modal.active")) {
    document.getElementById("modalBackdrop")?.classList.remove("active");
    document.body.style.overflow = "";
  }
}

// إضافة منتج للسلة
function addToCart(product, sizeObj, quantity = 1) {
  const cartItemKey = `${product.id}-${sizeObj.id}`;
  const existingIndex = appState.cart.findIndex(i => i.cartKey === cartItemKey);

  if (existingIndex > -1) {
    appState.cart[existingIndex].quantity += quantity;
  } else {
    appState.cart.push({
      cartKey: cartItemKey,
      productId: product.id,
      name: product.name,
      image: product.images[0],
      sizeId: sizeObj.id,
      sizeName: sizeObj.name,
      price: sizeObj.price,
      quantity: quantity
    });
  }

  saveCartToStorage();
  updateCartUI();
}

function updateCartItemQuantity(cartKey, delta) {
  const itemIndex = appState.cart.findIndex(i => i.cartKey === cartKey);
  if (itemIndex > -1) {
    appState.cart[itemIndex].quantity += delta;
    if (appState.cart[itemIndex].quantity <= 0) {
      appState.cart.splice(itemIndex, 1);
      showToast("تم حذف المنتج من السلة", "info");
    }
    saveCartToStorage();
    updateCartUI();
  }
}

function removeCartItem(cartKey) {
  appState.cart = appState.cart.filter(i => i.cartKey !== cartKey);
  saveCartToStorage();
  updateCartUI();
  showToast("تم حذف المنتج من السلة", "info");
}

function applyCouponCode(code) {
  const cleanCode = code.trim().toUpperCase();
  if (cleanCode === SHATHA_CONFIG.defaultCoupon) {
    appState.appliedCoupon = cleanCode;
    saveCartToStorage();
    updateCartUI();
    showToast(`تم تطبيق خصم 10% بنجاح! كود: ${cleanCode}`, "success");
    const input = document.getElementById("couponInput");
    if (input) input.value = cleanCode;
  } else {
    showToast("عذراً، كود الخصم غير صالح", "error");
  }
}

/**
 * طلب منتج فردي محدد من داخل السلة عبر الواتساب مباشرة
 * استجابة لطلب المستخدم: "وخلي لما ادخل علي السله يكون فيه الطلب عبر الواتس للمنتج اللي انا اختارتوو"
 */
function orderSingleCartItemViaWhatsapp(cartKey) {
  const item = appState.cart.find(i => i.cartKey === cartKey);
  if (!item) return;

  const totalItemPrice = item.price * item.quantity;
  const giftMsg = appState.giftCard.enabled && document.getElementById("giftCardMsgInput")?.value.trim() 
    ? document.getElementById("giftCardMsgInput").value.trim() 
    : null;

  let msg = `🌸 *طلب منتج عبر واتساب من متجر شذى* 🌸\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `• *المنتج المطلوب:* ${item.name}\n`;
  msg += `• *المقاس/التنسيق:* ${item.sizeName}\n`;
  msg += `• *الكمية:* ${item.quantity}\n`;
  msg += `• *السعر الإجمالي:* ${totalItemPrice} ج.م\n`;
  if (giftMsg) {
    msg += `💌 *نص كارت الإهداء:* "${giftMsg}"\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `أود تأكيد طلب هذا المنتج ومعرفة موعد التوصيل المتاح 💐`;

  const waUrl = `https://wa.me/${SHATHA_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

/**
 * إرسال كامل السلة عبر واتساب مباشرة
 */
function sendFullCartDirectToWhatsapp() {
  if (appState.cart.length === 0) {
    showToast("سلتك فارغة حالياً!", "error");
    return;
  }

  const subtotal = appState.cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const discount = appState.appliedCoupon ? Math.round(subtotal * (SHATHA_CONFIG.discountPercent / 100)) : 0;
  const finalTotal = subtotal - discount;
  const giftMsg = appState.giftCard.enabled && document.getElementById("giftCardMsgInput")?.value.trim() 
    ? document.getElementById("giftCardMsgInput").value.trim() 
    : null;

  let msg = `🌸 *طلب سلة مشتريات كاملة من متجر شذى (SHATHA)* 🌸\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 *المنتجات المختارة في السلة:*\n`;
  appState.cart.forEach((item, idx) => {
    msg += `${idx + 1}. *${item.name}*\n   - المقاس: ${item.sizeName}\n   - العدد: ${item.quantity}\n   - السعر: ${item.price * item.quantity} ج.م\n`;
  });
  msg += `\n`;
  if (giftMsg) {
    msg += `💌 *كارت الإهداء المجاني:* "${giftMsg}"\n\n`;
  }
  msg += `💰 *المجموع الفرعي:* ${subtotal} ج.م\n`;
  if (discount > 0) {
    msg += `🏷️ *خصم كوبون (${appState.appliedCoupon}):* -${discount} ج.م\n`;
  }
  msg += `⭐ *الإجمالي المطلوب:* ${finalTotal} ج.م (+ مصاريف الشحن حسب العنوان)\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `أرجو تأكيد الطلب وتحديد موعد الاستلام والتوصيل ✨`;

  const waUrl = `https://wa.me/${SHATHA_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

// تحديث واجهة السلة (UI)
function updateCartUI() {
  const badge = document.getElementById("cartCountBadge");
  const totalCount = appState.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (badge) {
    badge.innerText = totalCount;
  }

  const itemsContainer = document.getElementById("cartDrawerItems");
  const emptyState = document.getElementById("cartEmptyState");
  const subtotalElem = document.getElementById("cartSubtotalVal");
  const discountRow = document.getElementById("cartDiscountRow");
  const discountElem = document.getElementById("cartDiscountVal");
  const totalElem = document.getElementById("cartTotalVal");
  const freeMeterFill = document.getElementById("freeShippingMeterFill");
  const freeMeterText = document.getElementById("freeShippingMeterText");

  if (!itemsContainer) return;

  if (appState.cart.length === 0) {
    itemsContainer.style.display = "none";
    if (emptyState) emptyState.style.display = "block";
    if (subtotalElem) subtotalElem.innerText = `0 ${SHATHA_CONFIG.currency}`;
    if (discountRow) discountRow.style.display = "none";
    if (totalElem) totalElem.innerText = `0 ${SHATHA_CONFIG.currency}`;
    if (freeMeterFill) freeMeterFill.style.width = "0%";
    if (freeMeterText) freeMeterText.innerText = `أضيفي بـ ${SHATHA_CONFIG.freeShippingThreshold} ج.م للتوصيل المجاني`;
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  itemsContainer.style.display = "flex";

  // رسم قائمة عناصر السلة مع زر طلب مخصص للواتساب لكل منتج
  itemsContainer.innerHTML = appState.cart.map(item => `
    <div class="cart-item-card">
      <img src="${item.image}" alt="${item.name}" class="cart-item-img">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <div class="cart-item-variant">${item.sizeName}</div>
        <div class="cart-item-price">${item.price * item.quantity} ${SHATHA_CONFIG.currency}</div>
        
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 6px;">
          <div class="cart-qty-controls">
            <button class="qty-btn" onclick="updateCartItemQuantity('${item.cartKey}', -1)">-</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-btn" onclick="updateCartItemQuantity('${item.cartKey}', 1)">+</button>
          </div>

          <!-- زر الطلب المباشر عبر واتساب لهذا المنتج تحديداً -->
          <button type="button" 
                  class="btn-item-whatsapp" 
                  onclick="orderSingleCartItemViaWhatsapp('${item.cartKey}')"
                  title="طلب هذا المنتج مباشرة عبر واتساب 01102541236">
            <i class="fab fa-whatsapp"></i> طلب هذا المنتج واتساب
          </button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeCartItem('${item.cartKey}')" title="حذف">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
  `).join('');

  // الحسابات
  const subtotal = appState.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  let discount = 0;

  if (appState.appliedCoupon) {
    discount = Math.round(subtotal * (SHATHA_CONFIG.discountPercent / 100));
    if (discountRow) discountRow.style.display = "flex";
    if (discountElem) discountElem.innerText = `- ${discount} ${SHATHA_CONFIG.currency} (${SHATHA_CONFIG.discountPercent}%)`;
  } else {
    if (discountRow) discountRow.style.display = "none";
  }

  const finalTotal = Math.max(0, subtotal - discount);

  if (subtotalElem) subtotalElem.innerText = `${subtotal} ${SHATHA_CONFIG.currency}`;
  if (totalElem) totalElem.innerText = `${finalTotal} ${SHATHA_CONFIG.currency}`;

  // شريط الشحن المجاني
  if (freeMeterFill && freeMeterText) {
    const percent = Math.min(100, Math.round((subtotal / SHATHA_CONFIG.freeShippingThreshold) * 100));
    freeMeterFill.style.width = `${percent}%`;
    if (subtotal >= SHATHA_CONFIG.freeShippingThreshold) {
      freeMeterText.innerHTML = `🎉 مبروك! حصلتِ على توصيل مجاني لباقاتك!`;
      freeMeterFill.style.background = "#27AE60";
    } else {
      const remaining = SHATHA_CONFIG.freeShippingThreshold - subtotal;
      freeMeterText.innerHTML = `أضيفي بـ <strong>${remaining} ${SHATHA_CONFIG.currency}</strong> إضافية للشحن المجاني!`;
      freeMeterFill.style.background = "linear-gradient(90deg, var(--primary-pink), #25D366)";
    }
  }
}

function openCartDrawer() {
  closeAllModals();
  const drawer = document.getElementById("cartDrawer");
  const backdrop = document.getElementById("modalBackdrop");
  drawer?.classList.add("active");
  backdrop?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  drawer?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function setupShippingDropdown() {
  const select = document.getElementById("checkoutGovernorate");
  if (!select) return;

  select.innerHTML = appState.shippingZones.map(zone => `
    <option value="${zone.id}" ${zone.id === appState.selectedShippingZone ? 'selected' : ''}>
      ${zone.name} - ${zone.price} ج.م
    </option>
  `).join('');
}

function openCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  const backdrop = document.getElementById("modalBackdrop");
  updateCheckoutSummary();
  backdrop?.classList.add("active");
  modal?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  modal?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function updateCheckoutSummary() {
  const subtotal = appState.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = appState.appliedCoupon ? Math.round(subtotal * (SHATHA_CONFIG.discountPercent / 100)) : 0;
  
  const currentZone = appState.shippingZones.find(z => z.id === appState.selectedShippingZone) || appState.shippingZones[0];
  const isFreeShipping = subtotal >= SHATHA_CONFIG.freeShippingThreshold;
  const shippingCost = isFreeShipping ? 0 : currentZone.price;
  const total = subtotal - discount + shippingCost;

  const summaryContainer = document.getElementById("checkoutOrderSummaryBox");
  if (summaryContainer) {
    summaryContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem;">
        <span>إجمالي الباقات المختارة (${appState.cart.length}):</span>
        <strong>${subtotal} ${SHATHA_CONFIG.currency}</strong>
      </div>
      ${discount > 0 ? `
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem; color: #27AE60;">
        <span>خصم كوبون (${appState.appliedCoupon}):</span>
        <strong>- ${discount} ${SHATHA_CONFIG.currency}</strong>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem;">
        <span>تكلفة التوصيل (${currentZone.name.split('(')[0]}):</span>
        <strong>${isFreeShipping ? '<span style="color: #27AE60;">مجاني 🎉</span>' : `${shippingCost} ${SHATHA_CONFIG.currency}`}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #D5C2C4; font-size: 1.15rem; font-weight: 900; color: var(--primary-dark);">
        <span>المبلغ الإجمالي للدفع:</span>
        <span>${total} ${SHATHA_CONFIG.currency}</span>
      </div>
    `;
  }
}

// معالجة وإرسال الطلب عبر واتساب مع كامل البيانات
function handleCheckoutSubmit(e) {
  e?.preventDefault();

  const customerName = document.getElementById("checkoutName")?.value.trim();
  const customerPhone = document.getElementById("checkoutPhone")?.value.trim();
  const customerAddress = document.getElementById("checkoutAddress")?.value.trim();
  const deliveryDate = document.getElementById("checkoutDate")?.value || "في أسرع وقت اليوم";
  const deliveryTime = document.getElementById("checkoutTime")?.value || "توصيل عادي";
  const notes = document.getElementById("checkoutNotes")?.value.trim() || "لا توجد ملاحظات إضافية";

  const giftSender = document.getElementById("checkoutGiftSender")?.value.trim();
  const giftRecipient = document.getElementById("checkoutGiftRecipient")?.value.trim();
  const giftMessage = document.getElementById("checkoutGiftMessage")?.value.trim();

  if (!customerName || !customerPhone || !customerAddress) {
    showToast("يرجى إدخال الاسم ورقم هاتف الواتساب والعنوان بالتفصيل", "error");
    return;
  }

  const subtotal = appState.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = appState.appliedCoupon ? Math.round(subtotal * (SHATHA_CONFIG.discountPercent / 100)) : 0;
  const currentZone = appState.shippingZones.find(z => z.id === appState.selectedShippingZone) || appState.shippingZones[0];
  const isFreeShipping = subtotal >= SHATHA_CONFIG.freeShippingThreshold;
  const shippingCost = isFreeShipping ? 0 : currentZone.price;
  const grandTotal = subtotal - discount + shippingCost;

  const paymentNames = {
    cod: "الدفع نقداً عند الاستلام",
    instapay: "إنستاباي / فودافون كاش ومحافظ إلكترونية",
    visa: "بطاقة بنكية (فيزا / ماستركارد)"
  };
  const paymentMethodLabel = paymentNames[appState.selectedPaymentMethod] || "عند الاستلام";

  let orderMsg = `🌸 *طلب جديد من متجر شذى للهدايا والورد المصنوع (SHATHA)* 🌸\n`;
  orderMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
  orderMsg += `👤 *بيانات العميل:*\n`;
  orderMsg += `• الاسم: ${customerName}\n`;
  orderMsg += `• رقم الهاتف: ${customerPhone}\n`;
  orderMsg += `• العنوان: ${customerAddress}\n`;
  orderMsg += `• المنطقة/المحافظة: ${currentZone.name}\n`;
  orderMsg += `• موعد التوصيل المطلوب: ${deliveryDate} (${deliveryTime})\n\n`;

  orderMsg += `💐 *المنتجات والباقات المطلوبة:*\n`;
  appState.cart.forEach((item, index) => {
    orderMsg += `${index + 1}. *${item.name}*\n   - المقاس/التنسيق: ${item.sizeName}\n   - العدد: ${item.quantity}\n   - السعر: ${item.price * item.quantity} ج.م\n`;
  });
  orderMsg += `\n`;

  if (giftMessage || giftSender || giftRecipient) {
    orderMsg += `💌 *كارت الإهداء المجاني:*\n`;
    if (giftSender) orderMsg += `• من: ${giftSender}\n`;
    if (giftRecipient) orderMsg += `• إلى: ${giftRecipient}\n`;
    if (giftMessage) orderMsg += `• نص الإهداء: "${giftMessage}"\n\n`;
  }

  orderMsg += `💰 *تفاصيل الفاتورة:*\n`;
  orderMsg += `• المجموع: ${subtotal} ج.م\n`;
  if (discount > 0) {
    orderMsg += `• خصم كوبون (${appState.appliedCoupon}): -${discount} ج.م\n`;
  }
  orderMsg += `• الشحن: ${isFreeShipping ? 'مجاني 🎉' : `${shippingCost} ج.م`}\n`;
  orderMsg += `• *الإجمالي النهائي: ${grandTotal} ج.م*\n`;
  orderMsg += `• طريقة الدفع: ${paymentMethodLabel}\n`;
  if (notes && notes !== "لا توجد ملاحظات إضافية") {
    orderMsg += `• ملاحظات: ${notes}\n`;
  }
  orderMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
  orderMsg += `شذى.. إبداع يدوي يخلّد أجمل الذكريات ✨`;

  const orderReceipt = {
    orderId: "SH-" + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toLocaleDateString('ar-EG'),
    customerName,
    grandTotal,
    items: [...appState.cart]
  };

  appState.cart = [];
  saveCartToStorage();
  updateCartUI();

  closeCheckoutModal();

  const waUrl = `https://wa.me/${SHATHA_CONFIG.whatsappNumber}?text=${encodeURIComponent(orderMsg)}`;
  window.open(waUrl, '_blank');

  openSuccessModal(orderReceipt);
}

function openSuccessModal(order) {
  const modal = document.getElementById("successModal");
  const backdrop = document.getElementById("modalBackdrop");
  
  const idElem = document.getElementById("successOrderId");
  if (idElem) idElem.innerText = order.orderId;

  backdrop?.classList.add("active");
  modal?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeSuccessModal() {
  const modal = document.getElementById("successModal");
  modal?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function openPolicyModal(policyType) {
  closeAllModals();
  const modal = document.getElementById(`policyModal-${policyType}`);
  const backdrop = document.getElementById("modalBackdrop");
  if (modal) {
    modal.classList.add("active");
    backdrop?.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

function closePolicyModal(policyType) {
  const modal = document.getElementById(`policyModal-${policyType}`);
  modal?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function closeAllModals() {
  closeCartDrawer();
  closeProductModal();
  closeCheckoutModal();
  closeSuccessModal();
  document.querySelectorAll(".policy-modal").forEach(m => m.classList.remove("active"));
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function showToast(message, type = "info") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "fa-info-circle";
  if (type === "success") icon = "fa-check-circle";
  if (type === "error") icon = "fa-exclamation-triangle";

  toast.innerHTML = `
    <i class="fas ${icon}" style="color: ${type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : 'var(--primary-pink)'}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}
