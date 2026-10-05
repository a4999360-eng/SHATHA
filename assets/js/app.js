/**
 * متجر شذى للهدايا والزهور المصنوعة يدوياً (SHATHA)
 * تطبيق جافاسكريبت متكامل لإدارة السلة والمنتجات المصنوعة يدوياً (ورد ستان، بوكيهات فلوس، بوكيهات حلوى)
 * مع خاصية الطلب المباشر عبر واتساب لكل منتج داخل السلة
 * رقم الواتساب الرسمي: 01102541236 (+201102541236)
 */

const SHATHA_CONFIG = {
  storeName: "شذى للهدايا والورد المصنوع يدوياً",
  whatsappNumber: "201102541236", // 01102541236
  googleClientId: "452956702998-ivve5qvsvi174l08a3bbfep4cmkqn6o3.apps.googleusercontent.com",
  ownerEmail: "a4999360@gmail.com", // الحساب الخاص بمالك المتجر شذى
  defaultCoupon: "SHATHA10",
  discountPercent: 10,
  freeShippingThreshold: 1000,
  currency: "ج.م",
  // رابط قاعدة البيانات السحابية المركزية لمتجر شذى (Firebase / Cloud Realtime Database)
  firebaseDbUrl: localStorage.getItem('shatha_custom_firebase_url') || "https://shatha-store-default-rtdb.europe-west1.firebasedatabase.app"
};

// حالة التطبيق
let appState = {
  currentUser: null, // بيانات المستخدم المسجل بجوجل { id, name, email, picture, couponCode, couponUsed }
  products: typeof SHATHA_PRODUCTS !== 'undefined' ? SHATHA_PRODUCTS : [],
  shippingZones: typeof SHATHA_SHIPPING_ZONES !== 'undefined' ? SHATHA_SHIPPING_ZONES : [],
  searchQuery: "",
  sortBy: "default",
  activeWeddingDept: "all",
  selectedProduct: null,
  selectedSize: "standard",
  cart: [],
  appliedCoupon: null,
  selectedShippingZone: "cairo",
  giftCard: {
    enabled: false,
    message: ""
  },
  selectedPaymentMethod: "vodafone"
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

// التحقق من هوية مالك المتجر — يعتمد فقط على البريد الإلكتروني الرسمي للمالك
function isCurrentUserOwner() {
  // المتطلب الأساسي: يجب أن يكون المستخدم مسجلاً بحساب فعلي
  if (!appState.currentUser) return false;

  const user = appState.currentUser;
  const cleanEmail = (user.email || "").toLowerCase().trim();
  const ownerEmail = SHATHA_CONFIG.ownerEmail.toLowerCase().trim();

  // الطريقة الوحيدة الصارمة للتحقق: البريد الإلكتروني للمالك فقط
  if (cleanEmail && cleanEmail === ownerEmail) return true;

  return false;
}

/* ==========================================================================
   محرك المزامنة السحابية الفورية (Cloud Sync Engine) — Firebase REST API
   يتيح مزامنة المنتجات وتعديلات المالك والآراء عبر كافة الأجهزة والهواتف عالمياً
   يستخدم Firebase Realtime Database مجاناً بدون أي مكتبات خارجية
   ========================================================================== */
const SHATHA_CLOUD = {
  get dbUrl() {
    return SHATHA_CONFIG.firebaseDbUrl;
  },
  async get(key) {
    try {
      const url = `${this.dbUrl}/shatha_${key}.json?_t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {
      console.warn(`Cloud sync read error (${key}):`, e);
    }
    return null;
  },
  async set(key, data) {
    try {
      const url = `${this.dbUrl}/shatha_${key}.json`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.ok;
    } catch (e) {
      console.warn(`Cloud sync write error (${key}):`, e);
      return false;
    }
  }
};

// مزامنة المنتجات في الخلفية من السحابة لجميع الهواتف مع الحفاظ على منتجات المالك المضافة
async function syncProductsFromCloud() {
  try {
    const cloudProds = await SHATHA_CLOUD.get('products');
    if (Array.isArray(cloudProds) && cloudProds.length > 0) {
      const cloudIds = new Set(cloudProds.map(p => p.id));
      const defaultProds = typeof SHATHA_PRODUCTS !== 'undefined' ? SHATHA_PRODUCTS : [];
      const missing = defaultProds.filter(p => !cloudIds.has(p.id));
      
      // نحافظ على أي منتج مخصص أضافه المالك محلياً حتى لا يختفي عند المزامنة
      const customLocalProds = (appState.products || []).filter(p => (p.isCustom || String(p.id).startsWith('custom_')) && !cloudIds.has(p.id));
      const merged = [...customLocalProds, ...cloudProds, ...missing];

      appState.products = merged;
      try {
        localStorage.setItem('shatha_all_products_v2', JSON.stringify(merged));
      } catch(e){}
      renderProducts();
      renderWeddingSection();
    } else if (cloudProds === null && appState.products && appState.products.length > 0) {
      // قاعدة البيانات سحابياً جديدة أو فارغة — نقوم برفع الباقات الحالية لتأسيس السحابة فوراً
      await SHATHA_CLOUD.set('products', appState.products);
      console.log("☁️ تم تأسيس ورفع المنتجات لقاعدة بيانات Firebase بنجاح!");
    }
  } catch (e) {
    console.warn("Products cloud sync note:", e);
  }
}

// مزامنة آراء المتجر من السحابة لجميع الهواتف
async function syncStoreReviewsFromCloud() {
  try {
    const cloudReviews = await SHATHA_CLOUD.get('store_reviews');
    if (Array.isArray(cloudReviews) && cloudReviews.length > 0) {
      localStorage.setItem('shatha_store_reviews', JSON.stringify(cloudReviews));
      renderStoreTestimonials();
    }
  } catch (e) {
    console.warn("Reviews cloud sync note:", e);
  }
}

// تحميل ودمج المنتجات مع التعديلات المحفوظة
function loadAllProducts() {
  try {
    const defaultProds = typeof SHATHA_PRODUCTS !== 'undefined' ? [...SHATHA_PRODUCTS] : [];
    const savedAll = localStorage.getItem('shatha_all_products_v2');
    if (savedAll) {
      const parsed = JSON.parse(savedAll);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // ندمج المنتجات الافتراضية الجديدة (مثل باكدج العرسان) لتظهر فوراً
        const parsedIds = new Set(parsed.map(p => p.id));
        const newDefaults = defaultProds.filter(p => !parsedIds.has(p.id));
        if (newDefaults.length > 0) {
          const merged = [...parsed, ...newDefaults];
          try {
            localStorage.setItem('shatha_all_products_v2', JSON.stringify(merged));
          } catch(e){}
          return merged;
        }
        return parsed;
      }
    }

    const customProdsJson = localStorage.getItem('shatha_custom_products');
    let mergedList = [...defaultProds];
    if (customProdsJson) {
      const customProds = JSON.parse(customProdsJson);
      if (Array.isArray(customProds) && customProds.length > 0) {
        mergedList = [...customProds, ...defaultProds];
      }
    }
    localStorage.setItem('shatha_all_products_v2', JSON.stringify(mergedList));
    return mergedList;
  } catch (e) {
    console.warn("Error loading products:", e);
  }
  return typeof SHATHA_PRODUCTS !== 'undefined' ? [...SHATHA_PRODUCTS] : [];
}

// حفظ كافة المنتجات في التخزين المحلي ورفعها سحابياً لكافة المستخدمين
async function saveAllProductsToStorage() {
  try {
    try {
      localStorage.setItem('shatha_all_products_v2', JSON.stringify(appState.products));
    } catch (quotaErr) {
      console.warn("LocalStorage full, continuing with cloud upload:", quotaErr);
    }
    // مزامنة فورية على السحابة لتظهر التعديلات على كافة هواتف العملاء والمالك
    const synced = await SHATHA_CLOUD.set('products', appState.products);
    if (synced) {
      console.log("☁️ تم رفع المنتجات وتحديثها على السحابة لجميع الزوار بنجاح!");
    } else {
      console.warn("تنبيه: تعذر الرفع التلقائي للسحابة، يرجى مراجعة إعدادات Firebase.");
    }
    return synced;
  } catch (e) {
    console.error("Error saving products to storage:", e);
    return false;
  }
}

// حفظ واختبار الاتصال بقاعدة بيانات Firebase التفاعلي
async function saveAndTestFirebaseUrl() {
  const input = document.getElementById("ownerFirebaseUrlInput");
  const statusEl = document.getElementById("cloudStatusIndicator");
  const outputEl = document.getElementById("firebaseTestOutput");

  const url = input?.value.trim().replace(/\/+$/, '');
  if (!url || !url.startsWith("http")) {
    showToast("يرجى إدخال رابط Firebase صحيح يبدأ بـ https://", "error");
    return;
  }

  if (statusEl) {
    statusEl.innerText = "جاري الفحص...";
    statusEl.style.background = "#FFF3CD";
    statusEl.style.color = "#856404";
  }
  if (outputEl) {
    outputEl.innerHTML = `<span style="color: #2980B9;"><i class="fas fa-spinner fa-spin"></i> جاري اختبار الاتصال بقاعدة البيانات...</span>`;
  }

  localStorage.setItem('shatha_custom_firebase_url', url);
  SHATHA_CONFIG.firebaseDbUrl = url;

  try {
    // 1. اختبار القراءة
    const testRead = await fetch(`${url}/shatha_products.json?_t=${Date.now()}`, { cache: 'no-store' });
    if (!testRead.ok) {
      if (testRead.status === 401 || testRead.status === 403) {
        throw new Error("قاعدة البيانات محظورة (Permission Denied)! يرجى فتح تبويب Rules في Firebase وجعل read و write تساوي true ثم الضغط على زر Publish.");
      } else {
        throw new Error(`تعذر الاتصال بالرابط (رمز الاستجابة: ${testRead.status})`);
      }
    }

    // 2. اختبار الكتابة ورفع المنتجات
    const testWrite = await fetch(`${url}/shatha_products.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appState.products)
    });

    if (!testWrite.ok) {
      if (testWrite.status === 401 || testWrite.status === 403) {
        throw new Error("صلاحية الكتابة مقفولة! في صفحة Firebase ادخل على تبويب Rules واضبط write: true ثم اضغط Publish.");
      } else {
        throw new Error(`فشل رفع البيانات (رمز الخطأ: ${testWrite.status})`);
      }
    }

    if (statusEl) {
      statusEl.innerText = "✅ متصل ونشط";
      statusEl.style.background = "#D4EDDA";
      statusEl.style.color = "#155724";
    }
    if (outputEl) {
      outputEl.innerHTML = `<span style="color: #27AE60; font-weight: 700;"><i class="fas fa-check-circle"></i> تم الاتصال بنجاح ورفع ${appState.products.length} باقة للسحابة! التعديلات حية وتظهر لجميع الزوار فوراً.</span>`;
    }
    showToast("🎉 تم الاتصال بسحابة Firebase بنجاح ورفع المنتجات!", "success");

  } catch (err) {
    console.error("Firebase Test Error:", err);
    if (statusEl) {
      statusEl.innerText = "⚠️ بحاجة لضبط Rules";
      statusEl.style.background = "#F8D7DA";
      statusEl.style.color = "#721C24";
    }
    if (outputEl) {
      outputEl.innerHTML = `<span style="color: #C0392B; font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> ${err.message}</span>`;
    }
    showToast(err.message, "error");
  }
}

// زر رفع كافة المنتجات الحالية إلى السحابة فوراً
async function forceUploadAllProductsToCloud() {
  const outputEl = document.getElementById("firebaseTestOutput");
  if (outputEl) outputEl.innerHTML = `<span style="color: #2980B9;"><i class="fas fa-spinner fa-spin"></i> جاري رفع المنتجات للسحابة...</span>`;

  showToast("جاري رفع كافة المنتجات الحالية للسحابة...", "info");
  const ok = await SHATHA_CLOUD.set('products', appState.products);
  if (ok) {
    showToast("تم رفع كافة المنتجات لسحابة Firebase بنجاح! 🌸", "success");
    if (outputEl) outputEl.innerHTML = `<span style="color: #27AE60; font-weight: 700;"><i class="fas fa-check-circle"></i> تم رفع ${appState.products.length} باقة سحابياً بنجاح!</span>`;
  } else {
    showToast("تعذر الرفع، يرجى التأكد من ضبط قواعد Firebase (Rules).", "error");
    if (outputEl) outputEl.innerHTML = `<span style="color: #C0392B;"><i class="fas fa-times-circle"></i> فشل الرفع. تأكد من ضبط قواعد Firebase (Rules) إلى true.</span>`;
  }
}

// فحص سريع لحالة السحابة في الخلفية
async function checkCloudStatusBackground() {
  const statusEl = document.getElementById("cloudStatusIndicator");
  const input = document.getElementById("ownerFirebaseUrlInput");
  if (!statusEl) return;

  const url = SHATHA_CONFIG.firebaseDbUrl;
  if (input) input.value = url;

  try {
    const res = await fetch(`${url}/shatha_products.json?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      statusEl.innerText = "✅ متصل ونشط";
      statusEl.style.background = "#D4EDDA";
      statusEl.style.color = "#155724";
    } else {
      statusEl.innerText = "⚠️ بحاجة لضبط Rules";
      statusEl.style.background = "#F8D7DA";
      statusEl.style.color = "#721C24";
    }
  } catch (e) {
    statusEl.innerText = "⚠️ غير متصل";
    statusEl.style.background = "#F8D7DA";
    statusEl.style.color = "#721C24";
  }
}

// تصدير كود ملف products-data.js للمالك إذا رغب بحفظ نسخة دائمة
function exportProductsDataCode() {
  const code = `/**\n * ملف بيانات منتجات متجر شذى المحدث تلقائياً\n * تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}\n */\n\nconst FLOURS_PATH = "FLOURS/";\n\nconst SHATHA_PRODUCTS = ${JSON.stringify(appState.products, null, 2)};\n`;
  navigator.clipboard?.writeText(code);
  showToast("تم نسخ كود المنتجات بالكامل للحافظة! يمكنك لصقه بملف products-data.js", "success");
}

// بدء التشغيل
document.addEventListener("DOMContentLoaded", () => {
  appState.products = loadAllProducts();
  loadCurrentUser();
  loadCartFromStorage();
  renderProducts();
  renderWeddingSection();
  renderStoreTestimonials();
  updateCartUI();
  setupEventListeners();
  setupShippingDropdown();
  initGoogleSignIn();
  // مزامنة سحابية فورية في الخلفية لضمان تطابق البيانات مع سحابة شذى
  syncProductsFromCloud();
  syncStoreReviewsFromCloud();
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
    copyMyCoupon();
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

  // فلتر اختياري خاص بصفحات الأقسام والتصنيفات المستقلة
  if (Array.isArray(window.SHATHA_CATEGORY_FILTER) && window.SHATHA_CATEGORY_FILTER.length > 0) {
    const dept = (window.SHATHA_CURRENT_DEPT || '').toLowerCase().trim();
    filtered = filtered.filter(p => {
      // 1. إذا كان المعرف موجوداً في القائمة المحددة مسبقاً
      if (window.SHATHA_CATEGORY_FILTER.includes(p.id)) return true;
      // 2. إذا كان المنتج مخصصاً (custom) أو له تصنيف يطابق القسم الحالي
      if (dept && (p.isCustom || p.category || p.dept || p.weddingCategory)) {
        const pDept = (p.category || p.dept || '').toLowerCase().trim();
        const wCat = (p.weddingCategory || '').toLowerCase().trim();
        if (pDept && pDept === dept) return true;
        // مطابقة بالكلمات المفتاحية لأسماء الأقسام والتصنيفات
        if (dept === 'bouquets' && (pDept.includes('bouquet') || pDept.includes('بوكيه') || pDept.includes('ورد') || wCat === 'bridal_bouquet')) return true;
        if (dept === 'frames' && (pDept.includes('frame') || pDept.includes('برواز') || pDept.includes('إطار') || wCat === 'frames')) return true;
        if (dept === 'crowns' && (pDept.includes('crown') || pDept.includes('طوق') || pDept.includes('عقد') || wCat === 'crowns')) return true;
        if (dept === 'katb_ketab' && (pDept.includes('katb') || pDept.includes('كتب') || pDept.includes('بصمة') || pDept.includes('fingerprint') || pDept.includes('mandil') || wCat === 'katb_ketab' || wCat === 'mandil_fingerprint')) return true;
        if (dept === 'bags' && (pDept.includes('bag') || pDept.includes('حقيبة') || pDept.includes('علبة') || pDept.includes('هدية') || pDept.includes('كاندي') || pDept.includes('فلوس') || pDept.includes('money') || wCat === 'favors' || wCat === 'mandil_fingerprint')) return true;
      }
      return false;
    });
  }
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

  const isOwner = isCurrentUserOwner();

  grid.innerHTML = filtered.map(product => {
    const discountPercent = product.oldPrice ? Math.round(((product.oldPrice - product.basePrice) / product.oldPrice) * 100) : null;
    const badgeText = product.tag || (discountPercent ? `خصم ${discountPercent}%` : null);

    return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-thumb-wrap" onclick="openProductModal('${product.id}')">
          <img src="${product.images[0]}" alt="${product.name}" class="product-img" loading="lazy">
          ${badgeText ? `<span class="product-badge">${badgeText}</span>` : ''}
          ${isOwner ? `
            <div class="admin-card-badge-tools">
              <button type="button" class="btn-admin-icon edit" onclick="event.stopPropagation(); openEditProductModal('${product.id}')" title="تعديل بيانات وصور الباقة">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="btn-admin-icon delete" onclick="event.stopPropagation(); deleteProductById('${product.id}')" title="حذف الباقة نهائياً من المتجر">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          ` : ''}
          <button class="quick-view-overlay-btn" type="button">
            <i class="fas fa-eye"></i> تفاصيل الباقة والزوايا (${product.images.length} صور)
          </button>
        </div>
        
        <div class="product-info">
          <h3 class="product-title" onclick="openProductModal('${product.id}')">${product.name}</h3>
          
          <p class="product-short-desc-text" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
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
            <button class="btn-add-cart" onclick="quickAddToCart('${product.id}')" style="width: 100%;">
              <i class="fas fa-shopping-bag"></i> أضف للسلة
            </button>
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
  if (!productId) return;

  // البحث عن المنتج بكل الطرق الممكنة (المعرف، السلغ، حروف صغيرة، وقائمة الصندوق)
  const normId = String(productId).trim().toLowerCase();
  let product = null;

  if (appState && Array.isArray(appState.products)) {
    product = appState.products.find(p => p && (String(p.id).trim().toLowerCase() === normId || (p.slug && String(p.slug).trim().toLowerCase() === normId)));
  }
  if (!product && typeof SHATHA_PRODUCTS !== 'undefined' && Array.isArray(SHATHA_PRODUCTS)) {
    product = SHATHA_PRODUCTS.find(p => p && (String(p.id).trim().toLowerCase() === normId || (p.slug && String(p.slug).trim().toLowerCase() === normId)));
  }
  if (!product && typeof getWeddingBoxProducts === 'function') {
    const boxList = getWeddingBoxProducts();
    if (Array.isArray(boxList)) {
      product = boxList.find(p => p && (String(p.id).trim().toLowerCase() === normId || (p.slug && String(p.slug).trim().toLowerCase() === normId)));
    }
  }

  // إذا لم نجد المنتج، ننشئ كائناً افتراضياً فوراً لكي لا تتعطل النافذة أبداً
  if (!product) {
    console.warn("Product not found by ID, checking default box items:", productId);
    const boxMap = {
      "shatha-wedding-ivory-bridal": { name: "بوكيه ورد كبير للعروسة ستان ملكي ولؤلؤ", basePrice: 650, oldPrice: 790, image: "FLOURS/WhatsApp Image 2026-09-09 at 12.15.58 AM.jpeg", shortDesc: "بوكيه عروسة أسطوري مشغول يدوياً من ورد الستان الأوف وايت العاجي اللامع، مرصع بقلب كل وردة بحبات اللؤلؤ والكريستال النقي ليدوم مدى الحياة." },
      "shatha-wedding-frame-glass": { name: "برواز الفرح وكتب الكتاب التذكاري الزجاجي الفاخر", basePrice: 420, oldPrice: 520, image: "FLOURS/WhatsApp Image 2026-09-09 at 12.15.54 AM.jpeg", shortDesc: "برواز زجاجي مزدوج فاخر مصمم لحفظ وثيقة كتب الكتاب أو دعوة الفرح، محاط بورود ستان صغيرة مجففة وتطريز ليزر بأسماء العروسين." },
      "shatha-wedding-bridal-necklace": { name: "طقم وعقد العروسة الملكي باللؤلؤ والزركون", basePrice: 490, oldPrice: 650, image: "assets/images/bridal-necklace.jpg", shortDesc: "عقد زفاف ملكي ساحر مرصع باللؤلؤ العاجي النقي وأحجار الزركون اللامعة بقطع الألماس، مطلي بالذهب ومصحوب بعلبة مخملية بيضاء فاخرة." },
      "shatha-wedding-fingerprint-tree": { name: "لوحة بصمة كتب الكتاب التذكارية مع استاند وحبر", basePrice: 390, oldPrice: 490, image: "FLOURS/WhatsApp Image 2026-09-09 at 12.15.59 AM.jpeg", shortDesc: "لوحة كانفاس فاخرة بتصميم شجرة الفرح تطبع عليها بصمات وتوقيعات المعازيم كأوراق شجر ملونة، مرفقة بإطار ذهبي وعلبة أحبار ملونة واستاند." }
    };
    if (boxMap[productId] || boxMap[normId]) {
      const fallback = boxMap[productId] || boxMap[normId];
      product = {
        id: productId,
        name: fallback.name,
        basePrice: fallback.basePrice,
        oldPrice: fallback.oldPrice,
        shortDesc: fallback.shortDesc,
        images: [fallback.image || "assets/images/logo.jpg"],
        sizes: [{ id: "standard", name: "القطعة الأساسية الملكية", price: fallback.basePrice, stems: "شغل هاندميد متقن", sizeLabel: "المقاس القياسي" }]
      };
    } else {
      showToast("عذراً، لم يتم العثور على بيانات هذه القطعة", "error");
      return;
    }
  }

  // التأكد من وجود مصفوفة صور صالحة وغير فارغة
  if (!product.images || !Array.isArray(product.images) || product.images.length === 0) {
    product.images = [product.image || "assets/images/logo.jpg"];
  }

  // التأكد من وجود مصفوفة مقاسات صالحة وغير فارغة لتفادي أي خطأ
  if (!product.sizes || !Array.isArray(product.sizes) || product.sizes.length === 0) {
    product.sizes = [
      {
        id: "standard",
        name: "القطعة الأساسية الملكية",
        price: product.basePrice || 0,
        stems: "شغل هاندميد متقن",
        sizeLabel: "المقاس القياسي",
        desc: "تنفيذ يدوي فائق الجودة بأرقى الخامات لتدوم للأبد"
      }
    ];
  }

  appState.selectedProduct = product;
  appState.selectedSize = (product.sizes[0] && product.sizes[0].id) ? product.sizes[0].id : "standard";

  const modal = document.getElementById("productDetailsModal");
  const backdrop = document.getElementById("modalBackdrop");

  if (!modal) {
    console.error("Modal element #productDetailsModal not found in DOM!");
    return;
  }

  // إظهار المودال مع الخلفية
  modal.classList.add("active");
  backdrop?.classList.add("active");
  document.body.style.overflow = "hidden";

  // تجهيز معرض الصور والزوايا
  const mainImg = document.getElementById("modalMainImg");
  const thumbsContainer = document.getElementById("modalThumbnailsContainer");

  if (mainImg) {
    mainImg.src = product.images[0];
  }

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

  // أدوات المالك داخل نافذة التفاصيل
  const ownerTools = document.getElementById("modalOwnerTools");
  const isOwner = isCurrentUserOwner();
  if (ownerTools) {
    if (isOwner) {
      ownerTools.style.display = "flex";
      ownerTools.innerHTML = `
        <span style="font-weight: 700; color: #D35400; font-size: 0.85rem;"><i class="fas fa-crown"></i> إدارة الباقة (المالك):</span>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn-modal-admin edit" onclick="openEditProductModal('${product.id}')"><i class="fas fa-pen"></i> تعديل بيانات الباقة</button>
          <label class="btn-modal-admin edit" style="cursor:pointer; background: #2980B9;" title="تغيير الصورة الرئيسية فوراً">
            <i class="fas fa-camera"></i> تغيير الصورة
            <input type="file" accept="image/*" style="display:none;" onchange="handleModalProductImageChange('${product.id}', this.files)">
          </label>
          <button type="button" class="btn-modal-admin delete" onclick="deleteProductById('${product.id}')"><i class="fas fa-trash-alt"></i> حذف الباقة</button>
        </div>
      `;
    } else {
      ownerTools.style.display = "none";
    }
  }

  // إخفاء صندوق كتابة التقييم عند الفتح وتصفيره
  const reviewFormBox = document.getElementById("prodReviewFormBox");
  if (reviewFormBox) reviewFormBox.style.display = "none";

  // ملء النصوص والبيانات الأساسية
  const titleEl = document.getElementById("modalProductTitle");
  if (titleEl) titleEl.innerText = product.name || "باقة شذى الملكية";

  const ratingEl = document.getElementById("modalProductRating");
  if (ratingEl) ratingEl.innerText = product.rating || "5.0";

  const countEl = document.getElementById("modalProductReviewsCount");
  if (countEl) countEl.innerText = `(${product.reviewsCount || (product.reviews ? product.reviews.length : 25)} تقييم عرائس)`;

  const descEl = document.getElementById("modalProductDesc");
  if (descEl) descEl.innerText = product.shortDesc || "تنفيذ يدوي ملكي فاخر بأرقى الخامات لتدوم ليلة العمر للأبد.";

  const priceInitEl = document.getElementById("modalCurrentPrice");
  if (priceInitEl) {
    const initPrice = (product.sizes && product.sizes[0] && product.sizes[0].price) ? product.sizes[0].price : (product.basePrice || 0);
    priceInitEl.innerHTML = `${initPrice} <span class="currency">ج.م</span>`;
  }

  // الخامات والتصنيع
  const materialsBox = document.getElementById("modalMaterialsText");
  if (materialsBox) {
    materialsBox.innerText = product.materials || "أشرطة ستان حريري تركي فاخر عالي اللمعان، خامات ملكية مختارة بعناية لتدوم مدى الحياة.";
  }
  const craftBox = document.getElementById("modalCraftText");
  if (craftBox) {
    craftBox.innerText = product.craftsmanship || "صناعة يدوية متقنة 100% - طي وتشكيل احترافي يضمن بقاء الباقة ذكرى أبدية دون أن تذبل.";
  }

  // محدد الأحجام والمقاسات وتحديث السعر
  try {
    renderModalSizes(product);
    updateModalPrice(product);
  } catch(e) {
    console.warn("Sizes render note:", e);
  }

  // الميزات والضمانات
  const advList = document.getElementById("modalAdvantagesList");
  if (advList) {
    const advs = (Array.isArray(product.advantages) && product.advantages.length > 0) ? product.advantages : [
      "شغل هاندميد متقن 100% يدوم ذكرى أبدية لا تتأثر بمرور الزمن.",
      "خامات فاخرة عالية الجودة تضفي بريقاً وفخامة استثنائية لليلة العمر.",
      "كارت إهداء وتغليف راقٍ مجاناً مع كل طلب."
    ];
    advList.innerHTML = advs.map(adv => `<li>${adv}</li>`).join('');
  }

  // تقييمات العملاء بأمان كامل
  try {
    renderModalReviews(product);
  } catch(e) {
    console.warn("Reviews render note:", e);
  }

  // زر الإضافة للسلة من داخل المودال
  const addBtn = document.getElementById("modalAddToCartBtn");
  if (addBtn) {
    addBtn.onclick = () => {
      const selectedSizeObj = (product.sizes && product.sizes.find(s => s.id === appState.selectedSize)) || (product.sizes && product.sizes[0]) || { id: "standard", name: "القطعة الأساسية", price: product.basePrice || 0 };
      addToCart(product, selectedSizeObj, 1);
      showToast(`تمت إضافة "${product.name} - ${selectedSizeObj.name}" للسلة! 🌸`, "success");
      closeProductModal();
      openCartDrawer();
    };
  }

  // زر استفسار واتساب المباشر للباقة
  const waBtn = document.getElementById("modalWhatsappBtn");
  if (waBtn) {
    const waText = encodeURIComponent(`مرحباً فريق شذى 🌸 أود الاستفسار عن تفاصيل وسعر: ${product.name}`);
    waBtn.href = `https://wa.me/201102541236?text=${waText}`;
  }
}

// إغلاق نافذة تفاصيل المنتج
function closeProductModal() {
  const modal = document.getElementById("productDetailsModal");
  if (modal) modal.classList.remove("active");
  const backdrop = document.getElementById("modalBackdrop");
  if (backdrop) backdrop.classList.remove("active");
  document.body.style.overflow = "";
}
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;

/**
 * تغيير الصورة الرئيسية لأي منتج مباشرةً من نافذة التفاصيل (المالك فقط)
 */
function handleModalProductImageChange(productId, files) {
  if (!isCurrentUserOwner() || !files || files.length === 0) return;
  const file = files[0];
  if (!file.type.startsWith("image/")) {
    showToast("يرجى اختيار ملف صورة صالح", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const dataUrl = e.target.result;

      // تحديث المنتج في appState
      const prod = appState.products.find(p => p.id === productId);
      if (prod) {
        prod.images = [dataUrl, ...(prod.images.slice(1))];
        // تحديث الصورة الرئيسية في المودال فوراً
        const mainImg = document.getElementById("modalMainImg");
        if (mainImg) mainImg.src = dataUrl;
        // تحديث الـ thumbnails
        const thumbsContainer = document.getElementById("modalThumbnailsContainer");
        if (thumbsContainer && prod.images.length > 1) {
          thumbsContainer.innerHTML = prod.images.map((img, idx) => `
            <div class="modal-thumb ${idx === 0 ? 'active' : ''}" onclick="switchModalImage('${img}', this)">
              <img src="${img}" alt="زاوية ${idx + 1}">
            </div>
          `).join('');
        }
        // حفظ وتحديث الشبكة
        saveAllProductsToStorage();
        renderProducts();
        showToast("✅ تم تحديث صورة الباقة بنجاح!", "success");
      }
    } catch(err) {
      showToast("حدث خطأ أثناء معالجة الصورة", "error");
    }
  };
  reader.readAsDataURL(file);
}
window.handleModalProductImageChange = handleModalProductImageChange;

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
  if (!container || !product || !product.sizes || !Array.isArray(product.sizes)) return;

  container.innerHTML = product.sizes.map(size => `
    <div class="size-radio-option ${appState.selectedSize === size.id ? 'selected' : ''}" 
         onclick="selectModalSize('${size.id}')">
      <div class="size-info">
        <h6>${size.name}</h6>
        <p>${size.stems || ''} ${size.sizeLabel ? '• ' + size.sizeLabel : ''} ${size.desc ? '• ' + size.desc : ''}</p>
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
  if (!product || !product.sizes || !Array.isArray(product.sizes) || product.sizes.length === 0) return;
  const sizeObj = product.sizes.find(s => s.id === appState.selectedSize) || product.sizes[0];
  const priceElem = document.getElementById("modalCurrentPrice");
  if (priceElem && sizeObj) {
    priceElem.innerHTML = `${sizeObj.price} <span class="currency">ج.م</span>`;
  }
}

function renderModalReviews(product) {
  const container = document.getElementById("modalReviewsList");
  if (!container) return;

  if (!product || !product.reviews || !Array.isArray(product.reviews) || product.reviews.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">⭐ باقة معتمدة بتقييم 5 نجوم من عرائس شذى.</p>`;
    return;
  }

  const isOwner = isCurrentUserOwner();
  let myReviews = [];
  try {
    myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
  } catch(e){}

  const userEmail = (appState.currentUser && appState.currentUser.email) ? String(appState.currentUser.email).toLowerCase().trim() : null;

  container.innerHTML = product.reviews.map((rawRev, idx) => {
    if (!rawRev) return '';
    let rev = rawRev;
    if (typeof rawRev === 'string') {
      rev = { id: `pr_${product.id}_${idx}`, author: 'عروس شذى', comment: rawRev, rating: 5, date: 'مؤخراً' };
    } else if (typeof rawRev === 'object') {
      rev = { ...rawRev };
    }
    if (!rev.id) {
      rev.id = `pr_${product.id}_${idx}`;
    }
    const revEmail = rev.authorEmail ? String(rev.authorEmail).toLowerCase().trim() : null;
    const isMyReview = (rev.id && myReviews.includes(rev.id)) || (userEmail && revEmail && revEmail === userEmail);
    const canDelete = isOwner || isMyReview;

    return `
      <div style="background: var(--bg-body); padding: 12px 16px; border-radius: var(--radius-md); margin-bottom: 10px; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: var(--text-main); font-size: 0.9rem;">${rev.author || 'عروس شذى'}</strong>
            ${isMyReview ? '<span style="font-size: 0.7rem; background: var(--bg-card); color: var(--primary-pink); padding: 2px 6px; border-radius: 6px; font-weight: 600;">تقييمك</span>' : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #F5A623; font-size: 0.85rem;">★ ${rev.rating || 5}</span>
            ${canDelete ? `
              <button type="button" 
                      class="btn-del-review" 
                      onclick="event.stopPropagation(); deleteProductReview('${product.id}', ${idx})" 
                      title="${isOwner ? 'حذف هذا التقييم نهائياً (صلاحية المالك)' : 'حذف تقييمي'}">
                <i class="fas fa-trash-alt"></i>
              </button>
            ` : ''}
          </div>
        </div>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.6; margin: 4px 0;">${rev.comment || 'شغل هاندميد في منتهى الجمال والفخامة.'}</p>
        <small style="color: var(--text-light); font-size: 0.75rem;">${rev.date || 'مؤخراً'}</small>
      </div>
    `;
  }).join('');
}

// حذف تقييم منتج (للمالك على أي تقييم، وللعميل على تقييمه الخاص)
function deleteProductReview(productId, reviewIdx) {
  const isOwner = isCurrentUserOwner();
  const prod = appState.products.find(p => p.id === productId);
  if (!prod || !prod.reviews || !prod.reviews[reviewIdx]) return;

  const rev = prod.reviews[reviewIdx];
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
  const isMyReview = (rev.id && myReviews.includes(rev.id)) || 
                     (appState.currentUser && rev.authorEmail && rev.authorEmail.toLowerCase() === appState.currentUser.email.toLowerCase());

  if (!isOwner && !isMyReview) {
    showToast("عذراً، لا تملك صلاحية حذف هذا التقييم", "error");
    return;
  }

  if (!confirm("هل أنت متأكد من رغبتك في حذف هذا التقييم نهائياً؟")) return;

  prod.reviews.splice(reviewIdx, 1);
  prod.reviewsCount = prod.reviews.length;
  if (prod.reviews.length > 0) {
    const sum = prod.reviews.reduce((acc, r) => acc + (parseFloat(r.rating) || 5), 0);
    prod.rating = (sum / prod.reviews.length).toFixed(1);
  } else {
    prod.rating = "5.0";
  }

  saveAllProductsToStorage();
  renderModalReviews(prod);

  const rElem = document.getElementById("modalProductRating");
  const cElem = document.getElementById("modalProductReviewsCount");
  if (rElem) rElem.innerText = prod.rating;
  if (cElem) cElem.innerText = `(${prod.reviewsCount} تقييم)`;

  renderProducts();
  showToast(isOwner ? "تم حذف التقييم نهائياً بصلاحية المالك ومزامنته سحابياً 🌸" : "تم حذف تقييمك بنجاح", "success");
}

// تبديل إظهار/إخفاء نموذج تقييم الباقة
function toggleProdReviewForm() {
  const box = document.getElementById("prodReviewFormBox");
  if (!box) return;
  box.style.display = box.style.display === "none" ? "block" : "none";
}

// ضبط عدد النجوم في تقييم الباقة
function setProdRating(val) {
  const hiddenInput = document.getElementById("prRatingVal");
  if (hiddenInput) hiddenInput.value = val;
  const stars = document.querySelectorAll("#prodRatingStars i");
  stars.forEach((s, idx) => {
    if (idx < val) {
      s.classList.add("active");
    } else {
      s.classList.remove("active");
    }
  });
}

// إرسال تقييم جديد للباقة الحالية
function handleProductReviewSubmit(e) {
  e.preventDefault();
  if (!appState.selectedProduct) return;

  const author = document.getElementById("prAuthor")?.value.trim() || (appState.currentUser?.name || "عميل شذى");
  const rating = parseInt(document.getElementById("prRatingVal")?.value) || 5;
  const comment = document.getElementById("prComment")?.value.trim();

  if (!comment) {
    showToast("يرجى كتابة رأيك في الباقة أولاً", "error");
    return;
  }

  if (!Array.isArray(appState.selectedProduct.reviews)) {
    appState.selectedProduct.reviews = [];
  }

  const reviewId = 'pr_' + Date.now();
  const newReview = {
    id: reviewId,
    author: author,
    authorEmail: appState.currentUser?.email || '',
    rating: rating,
    comment: comment,
    date: "الآن"
  };

  appState.selectedProduct.reviews.unshift(newReview);
  appState.selectedProduct.reviewsCount = appState.selectedProduct.reviews.length;
  
  // إعادة حساب متوسط التقييم
  const sum = appState.selectedProduct.reviews.reduce((acc, r) => acc + (parseFloat(r.rating) || 5), 0);
  appState.selectedProduct.rating = (sum / appState.selectedProduct.reviews.length).toFixed(1);

  // حفظ في قائمة تقييماتي للعميل لتمكينه من حذفه
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
  myReviews.push(reviewId);
  localStorage.setItem('shatha_my_reviews', JSON.stringify(myReviews));

  saveAllProductsToStorage();
  renderModalReviews(appState.selectedProduct);
  
  // تحديث النصوص في النافذة والبطاقة
  const rElem = document.getElementById("modalProductRating");
  const cElem = document.getElementById("modalProductReviewsCount");
  if (rElem) rElem.innerText = appState.selectedProduct.rating;
  if (cElem) cElem.innerText = `(${appState.selectedProduct.reviewsCount} تقييم)`;

  renderProducts();

  // إفراغ النموذج وإخفائه
  document.getElementById("prComment").value = "";
  toggleProdReviewForm();
  showToast("شكراً لمشاركتك! تمت إضافة تقييمك ومزامنته سحابياً بنجاح 🌸", "success");
}

/* ==========================================================================
   نظام آراء وتقييمات المتجر بالكامل (Store-Wide Testimonials)
   مع إمكانية الحذف الفوري للمالك ومزامنتها سحابياً لجميع الزوار
   ========================================================================== */
const DEFAULT_STORE_REVIEWS = [
  {
    id: "sr_def_1",
    author: "نورهان حسين",
    location: "القاهرة • بوكيه ورد ستان أحمر ملكي",
    rating: 5,
    comment: "بوكيه الورد الستان طلع في الحقيقة خيال! لمعة الستان والتغليف الأسود مع الأحمر مدي شياكة وفخامة خيالية، وأجمل حاجة إنه هيفضل ذكرى دايمة مش بيذبل خالص."
  },
  {
    id: "sr_def_2",
    author: "محمود عبد العزيز",
    location: "التجمع الخامس • بوكيه النقود الملكي الضخم",
    rating: 5,
    comment: "طلبت بوكيه الفلوس الملكي في خطوبة أختي وكان مفاجأة الحفلة كلها! لف الفلوس متقن جداً ونظيف ومن غير ما تتجرح، ذوق عالي والتزام في الميعاد."
  },
  {
    id: "sr_def_3",
    author: "سارة منصور",
    location: "الشيخ زايد • بوكيه حلوى اللولي بوب",
    rating: 5,
    comment: "بوكيهات اللولي بوب كانت كيوت ومبهجة جداً! أصحابي في حفلة التخرج طاروا بيها من الفرحة، والتعامل على الواتساب راقي وسريع جداً."
  }
];

function loadStoreReviews() {
  try {
    const saved = localStorage.getItem('shatha_store_reviews');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error loading store reviews:", e);
  }
  return [...DEFAULT_STORE_REVIEWS];
}

function saveStoreReviews(reviews) {
  try {
    localStorage.setItem('shatha_store_reviews', JSON.stringify(reviews));
    SHATHA_CLOUD.set('store_reviews', reviews);
  } catch (e) {
    console.error("Error saving store reviews:", e);
  }
}

function renderStoreTestimonials() {
  const grid = document.getElementById("testimonialsGrid");
  if (!grid) return;

  const reviews = loadStoreReviews();
  const isOwner = isCurrentUserOwner();
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');

  grid.innerHTML = reviews.map(rev => {
    const stars = '★'.repeat(rev.rating || 5);
    const initials = rev.author ? rev.author.split(' ').map(w => w[0]).join('.').slice(0, 5) : 'ع.ش';
    const isMyReview = (rev.id && myReviews.includes(rev.id)) || 
                       (appState.currentUser && rev.authorEmail && rev.authorEmail.toLowerCase() === appState.currentUser.email.toLowerCase());
    const canDelete = isOwner || isMyReview;

    return `
      <div class="testimonial-card">
        ${canDelete ? `
          <button type="button" 
                  class="btn-del-review" 
                  onclick="event.stopPropagation(); deleteStoreReview('${rev.id}')" 
                  title="${isOwner ? 'حذف هذا الرأي نهائياً كمالك للمتجر' : 'حذف رأيي'}">
            <i class="fas fa-trash-alt"></i>
          </button>
        ` : ''}
        <div class="testimonial-stars" style="color: #F5A623;">${stars}</div>
        <p class="testimonial-quote">"${rev.comment}"</p>
        <div class="testimonial-author">
          <div class="author-avatar">${initials}</div>
          <div class="author-info">
            <h5>${rev.author} ${isMyReview ? '<span style="font-size: 0.7rem; color: var(--primary-pink);">(رأيك)</span>' : ''}</h5>
            <span>${rev.location || 'عميل موثوق • متجر شذى'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// حذف رأي من آراء المتجر
function deleteStoreReview(revId) {
  const isOwner = isCurrentUserOwner();
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
  const reviews = loadStoreReviews();
  const targetRev = reviews.find(r => String(r.id) === String(revId));

  if (!targetRev) return;

  const isMyReview = (targetRev.id && myReviews.includes(targetRev.id)) || 
                     (appState.currentUser && targetRev.authorEmail && targetRev.authorEmail.toLowerCase() === appState.currentUser.email.toLowerCase());

  if (!isOwner && !isMyReview) {
    showToast("عذراً، لا تملك صلاحية حذف هذا الرأي", "error");
    return;
  }

  if (!confirm("هل أنت متأكد من رغبتك في حذف هذا الرأي نهائياً؟ سيتم حذفه من كافة الأجهزة.")) return;

  const updated = reviews.filter(r => String(r.id) !== String(revId));
  saveStoreReviews(updated);
  renderStoreTestimonials();
  showToast(isOwner ? "تم حذف الرأي نهائياً بصلاحية المالك ومزامنته سحابياً 🌸" : "تم حذف رأيك بنجاح", "success");
}

function toggleStoreReviewForm() {
  const card = document.getElementById("storeReviewFormCard");
  if (!card) return;
  card.classList.toggle("active");
  if (card.classList.contains("active")) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("srAuthor")?.focus();
  }
}

function setStoreRating(val) {
  const input = document.getElementById("srRatingVal");
  if (input) input.value = val;
  const stars = document.querySelectorAll("#storeRatingStars i");
  stars.forEach((s, idx) => {
    if (idx < val) {
      s.classList.add("active");
    } else {
      s.classList.remove("active");
    }
  });
}

function handleStoreReviewSubmit(e) {
  e.preventDefault();
  const author = document.getElementById("srAuthor")?.value.trim() || (appState.currentUser?.name || "عميل متجر شذى");
  const location = document.getElementById("srLocation")?.value.trim() || "عميل متجر شذى";
  const rating = parseInt(document.getElementById("srRatingVal")?.value) || 5;
  const comment = document.getElementById("srComment")?.value.trim();

  if (!author || !comment) {
    showToast("يرجى ملء الاسم والتعليق أولاً", "error");
    return;
  }

  const reviewId = 'sr_' + Date.now();
  const newReview = {
    id: reviewId,
    author,
    authorEmail: appState.currentUser?.email || '',
    location,
    rating,
    comment,
    date: new Date().toLocaleDateString('ar-EG')
  };

  try {
    let reviews = loadStoreReviews();
    reviews.unshift(newReview);
    saveStoreReviews(reviews);

    // تسجيل المعرف في تقييماتي للعميل
    const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
    myReviews.push(reviewId);
    localStorage.setItem('shatha_my_reviews', JSON.stringify(myReviews));

    renderStoreTestimonials();
    toggleStoreReviewForm();
    document.getElementById("storeReviewForm")?.reset();
    setStoreRating(5);
    showToast("شكراً لمشاركتك! تم نشر رأيك ومزامنته سحابياً بنجاح 🌸", "success");
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء حفظ تقييمك", "error");
  }
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

  // التحقق من كود المستخدم الفردي
  if (appState.currentUser && appState.currentUser.couponCode === cleanCode) {
    if (appState.currentUser.couponUsed) {
      showToast("عذراً، هذا الكود تم استخدامه بالفعل مسبقاً! كل حساب له استخدام لمرة واحدة فقط.", "error");
      return;
    }
    appState.appliedCoupon = cleanCode;
    saveCartToStorage();
    updateCartUI();
    showToast(`تم تطبيق خصم 10% الخاص بحسابك بنجاح! 🎉 (${cleanCode})`, "success");
    const input = document.getElementById("couponInput");
    if (input) input.value = cleanCode;
    return;
  }

  // التحقق من الكوبون الافتراضي العام إذا لم يكن مسجلاً
  if (cleanCode === SHATHA_CONFIG.defaultCoupon) {
    appState.appliedCoupon = cleanCode;
    saveCartToStorage();
    updateCartUI();
    showToast(`تم تطبيق خصم 10% بنجاح! كود: ${cleanCode}`, "success");
    const input = document.getElementById("couponInput");
    if (input) input.value = cleanCode;
    return;
  }

  showToast("عذراً، كود الخصم غير صالح أو غير مرتبط بحسابك", "error");
}

/**
 * طلب منتج فردي محدد من داخل السلة:
 * توجيه العميل لصفحة checkout.html لملء بيانات التواصل ومكان التوصيل الإلزامية أولاً قبل إرسال الفاتورة للواتساب
 */
function orderSingleCartItemViaWhatsapp(cartKey) {
  const item = appState.cart.find(i => i.cartKey === cartKey);
  if (!item) return;

  showToast("يرجى ملء بيانات التواصل ومكان التوصيل أولاً لتجهيز فاتورة طلبك للواتساب", "info");
  closeCartDrawer();
  setTimeout(() => {
    window.location.href = "checkout.html";
  }, 400);
}

/**
 * إرسال كامل السلة عبر واتساب:
 * توجيه العميل لصفحة checkout.html لملء بيانات التواصل ومكان التوصيل الإلزامية أولاً
 */
function sendFullCartDirectToWhatsapp() {
  if (appState.cart.length === 0) {
    showToast("سلتك فارغة حالياً!", "error");
    return;
  }

  showToast("جاري توجيهك لصفحة كتابة بيانات التواصل والتوصيل لتأكيد الطلب عبر الواتساب", "info");
  closeCartDrawer();
  setTimeout(() => {
    window.location.href = "checkout.html";
  }, 400);
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
        ${item.customText ? `<div style="font-size: 0.73rem; color: var(--accent-gold); line-height: 1.35; margin: 4px 0; background: rgba(212,175,55,0.08); padding: 4px 8px; border-radius: 6px; border: 1px dashed rgba(212,175,55,0.3);"><i class="fas fa-ring" style="font-size:0.68rem;"></i> ${item.customText}</div>` : ''}
        <div class="cart-item-price">${item.price * item.quantity} ${SHATHA_CONFIG.currency}</div>
        
        <div style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; margin-top: 6px;">
          <div class="cart-qty-controls">
            <button class="qty-btn" onclick="updateCartItemQuantity('${item.cartKey}', -1)">-</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-btn" onclick="updateCartItemQuantity('${item.cartKey}', 1)">+</button>
          </div>
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

  const optionsHtml = appState.shippingZones.map(zone => `
    <option value="${zone.id}" ${zone.id === appState.selectedShippingZone ? 'selected' : ''}>
      ${zone.name} - ${zone.price} ج.م
    </option>
  `).join('') + `
    <option value="custom">✏️ أخرى (كتابة اسم المحافظة يدوياً)</option>
  `;

  select.innerHTML = optionsHtml;

  select.addEventListener("change", (e) => {
    const manualWrap = document.getElementById("manualGovWrapper");
    if (e.target.value === "custom") {
      if (manualWrap) manualWrap.style.display = "block";
      const customInput = document.getElementById("customGovInput");
      customInput?.focus();
      let customZone = appState.shippingZones.find(z => z.id === "custom");
      if (!customZone) {
        customZone = { id: "custom", name: customInput?.value.trim() || "محافظة أخرى", price: 60 };
        appState.shippingZones.push(customZone);
      }
      appState.selectedShippingZone = "custom";
      updateCheckoutSummary();
    } else {
      if (manualWrap) manualWrap.style.display = "none";
      appState.selectedShippingZone = e.target.value;
      updateCheckoutSummary();
    }
  });

  const customInput = document.getElementById("customGovInput");
  customInput?.addEventListener("input", (e) => {
    const val = e.target.value.trim() || "محافظة أخرى";
    let customZone = appState.shippingZones.find(z => z.id === "custom");
    if (!customZone) {
      customZone = { id: "custom", name: val, price: 60 };
      appState.shippingZones.push(customZone);
    } else {
      customZone.name = val;
    }
    appState.selectedShippingZone = "custom";
    updateCheckoutSummary();
  });
}

function openCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  const backdrop = document.getElementById("modalBackdrop");
  updateCheckoutSummary();

  // تعبئة رقم الهاتف والاسم تلقائياً من الحساب مع إمكانية التعديل بحرية
  if (appState.currentUser) {
    const phoneInput = document.getElementById("checkoutPhone");
    if (phoneInput && !phoneInput.value && appState.currentUser.phone) {
      phoneInput.value = appState.currentUser.phone;
    }
    const nameInput = document.getElementById("checkoutName");
    if (nameInput && !nameInput.value && appState.currentUser.name) {
      nameInput.value = appState.currentUser.name;
    }
  }

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
  const deliveryDate = document.getElementById("checkoutDate")?.value || document.getElementById("cDeliveryDate")?.value || "في أسرع وقت";
  const deliveryUrgency = document.querySelector('input[name="checkoutUrgency"]:checked')?.value || document.querySelector('input[name="deliveryUrgency"]:checked')?.value || "standard";
  const deliveryReason = document.getElementById("checkoutDeliveryReason")?.value?.trim() || document.getElementById("cDeliveryReason")?.value?.trim() || "";
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
    vodafone: "فودافون كاش / محافظ إلكترونية (01152998910 أو 01002398698)",
    instapay: "إنستاباي InstaPay"
  };
  const paymentMethodLabel = paymentNames[appState.selectedPaymentMethod] || "فودافون كاش / محافظ إلكترونية";

  const urgencyLabel = deliveryUrgency === "urgent" ? "⚡ مستعجل (تسليم سريع/نفس اليوم)" : "🌸 عادي (الموعد المحدد)";

  let orderMsg = `🌸 *طلب جديد من متجر شذى للهدايا والورد المصنوع (SHATHA)* 🌸\n`;
  orderMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
  orderMsg += `👤 *بيانات العميل:*\n`;
  orderMsg += `• الاسم: ${customerName}\n`;
  orderMsg += `• رقم الهاتف: ${customerPhone}\n`;
  orderMsg += `• العنوان: ${customerAddress}\n`;
  orderMsg += `• المحافظة/المنطقة: ${currentZone.name}\n`;
  orderMsg += `• موعد التوصيل المطلوب: ${deliveryDate}\n`;
  orderMsg += `• نوع التوصيل: ${urgencyLabel}\n`;
  if (deliveryReason) {
    orderMsg += `• تفاصيل الموعد / سبب الاستعجال: ${deliveryReason}\n`;
  }
  orderMsg += `\n`;

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

  // تعليم كود الخصم الفردي كمستخدم لمرة واحدة فقط
  if (appState.currentUser && appState.appliedCoupon === appState.currentUser.couponCode) {
    localStorage.setItem(`shatha_coupon_used_${appState.currentUser.id}`, 'true');
    appState.currentUser.couponUsed = true;
    localStorage.setItem('shatha_google_user', JSON.stringify(appState.currentUser));
    updateAuthUI();
  }

  appState.cart = [];
  appState.appliedCoupon = null;
  localStorage.removeItem('shatha_applied_coupon');
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

/* ==========================================================================
   إدارة وعرض نوافذ السياسات والثقة المتكاملة (Universal Policies System)
   ========================================================================== */

const SHATHA_POLICIES_DATA = {
  guarantee: {
    id: "guarantee",
    title: "ضمان الجودة والإتقان الملكي",
    icon: "fa-award",
    colorClass: "gold",
    badgeText: "ضمان شذى الذهبي 100%",
    updatedDate: "أكتوبر ٢٠٢٦",
    alertType: "green",
    alertIcon: "fa-shield-alt",
    alertColor: "#1A8C4E",
    alertText: "كل باقة أو قطعة تخرج من أتيليه شذى تمر بفحص جودة يدوي دقيق بموجب معايير فنية صارمة. نضمن أعلى درجات الإتقان أو نلتزم بإعادة التنفيذ الفوري على نفقتنا الكاملة.",
    sections: [
      {
        title: "صناعة يدوية فاخرة 100% (Handcrafted with Passion)",
        icon: "fa-hand-sparkles",
        content: `
          <p>كافة باقات الورد الستان، والبراويز التذكارية، وصناديق العرسان، ومستلزمات عقد القران تُنفذ يدوياً بحرفية متقنة على أيدي صانعات متخصصات. لا نعتمد على أي ماكينات أو خطوط تجميع آلية لضمان تفرد كل قطعة بلمستها الراقية.</p>
          <p>ننتقي خاماتنا من أندر درجات أشرطة الستان التركي الحريري فائق النعومة واللمعان، واللؤلؤ العاجي، والكريستال والزركون النقي، ومعادن مطلية لا تصدأ ولا يتغير بريقها مع مرور السنين.</p>
        `
      },
      {
        title: "يدوم للأبد ولا يذبل (Eternal Quality)",
        icon: "fa-infinity",
        content: `
          <p>ورد الستان الفاخر لا يذبل، لا يتعفن، ولا يحتاج لأي ماء أو إضاءة شمسية، صُمم خصيصاً ليخلد ذكرى ليلة العمر كتحفة فنية تحتفظ بكامل بهائها لعشرات السنين طالما حُفظ في بيئة جافة ومعتدلة.</p>
          <p><strong>استثناءات الضمان:</strong> لا يشمل الضمان التلف الناتج عن الغمر المباشر بالماء، أو التعرض للنيران أو السقوط والدهس المتعمد بعد استلام الطلب.</p>
        `
      },
      {
        title: "أمان الأوراق النقدية بنسبة 100% في باقات الفلوس",
        icon: "fa-money-bill-wave",
        content: `
          <p>نبتكر تقنية طي هندسية معتمدة لحفظ الأوراق النقدية بدون أي استخدام للمواد اللاصقة الكيميائية أو الدبابيس الحادة التي قد تمزق الورق، مما يتيح للعميل استخراج وفك النقود واستخدامها لاحقاً بكل سهولة وسلاسة دون فقدان مليمتر واحد من الورقة النقدية.</p>
        `
      },
      {
        title: "التوثيق والتصوير قبل الشحن",
        icon: "fa-camera",
        content: `
          <p>لضمان راحة بالك التامة، يقوم فريق خدمة العملاء بإرسال صور وفيديو عالي الدقة للمنتج النهائي بعد تجهيزه وتطريزه عبر واتساب لاعتماده قبل انطلاق المندوب. في حال وجود أي ملاحظة نعدلها فوراً قبل الشحن.</p>
        `
      },
      {
        title: "التزام الاستبدال السريع في حالات العيوب",
        icon: "fa-redo",
        content: `
          <p>في حال وصول المنتج بأي عيب مصنعي أو تلف ناتج عن نقل الشحنة، نتحمل كامل التكاليف ونقوم بإعادة التنفيذ الفوري وإرسال الباقة مجاناً خلال نفس اليوم أو اليوم التالي مباشرة.</p>
          <a href="https://wa.me/201102541236?text=مرحباً فريق شذى، لدي استفسار بخصوص ضمان الجودة والإتقان" target="_blank" class="policy-wa-btn">
            <i class="fab fa-whatsapp"></i> تواصل مع قسم الجودة عبر واتساب
          </a>
        `
      }
    ]
  },
  delivery: {
    id: "delivery",
    title: "سياسة الشحن والتوصيل السريع",
    icon: "fa-truck-fast",
    colorClass: "blue",
    badgeText: "توصيل آمن لنفس اليوم",
    updatedDate: "أكتوبر ٢٠٢٦",
    alertType: "info",
    alertIcon: "fa-info-circle",
    alertColor: "#2980B9",
    alertText: "تُحسب مدة التوصيل بدقة بدءاً من لحظة اعتماد الطلب وسداد الدفعة المسبقة عبر القنوات المعتمدة، وليس من وقت الاستفسار الأولي.",
    sections: [
      {
        title: "مواعيد التوصيل في نفس اليوم (القاهرة الكبرى)",
        icon: "fa-bolt",
        content: `
          <p>نوفر خدمة التوصيل السريع بواسطة مناديب شذى المعتمدين والمجهزين بحوامل مخصصة لحمل باقات الورد والهدايا دون تعرضها لأي اهتزاز:</p>
          <table class="policy-table">
            <thead>
              <tr><th>المنطقة الجغرافية</th><th>مدة التوصيل المعتادة</th><th>نوع الخدمة</th></tr>
            </thead>
            <tbody>
              <tr><td>التجمع، الرحاب، القاهرة الجديدة، مدينتي</td><td>٢ - ٤ ساعات</td><td>نفس اليوم (VIP)</td></tr>
              <tr><td>مدينة نصر، مصر الجديدة، النزهة، المقطم</td><td>٣ - ٥ ساعات</td><td>نفس اليوم</td></tr>
              <tr><td>وسط البلد، الدقي، المهندسين، المعادي</td><td>٣ - ٥ ساعات</td><td>نفس اليوم</td></tr>
              <tr><td>الشيخ زايد، 6 أكتوبر، حدائق الأهرام</td><td>٤ - ٦ ساعات</td><td>نفس اليوم</td></tr>
              <tr><td>الإسكندرية، طنطا، المنصورة، وباقي المحافظات</td><td>٢٤ - ٤٨ ساعة</td><td>شحن مصفح آمن</td></tr>
            </tbody>
          </table>
        `
      },
      {
        title: "التغليف المصفح ضد الصدمات للشحن الخارجي",
        icon: "fa-box-open",
        content: `
          <p>كافة الطلبات المشحونة للمحافظات تُوضع داخل صناديق كرتونية مضلعة خماسية الطبقات (5-Ply Heavy Duty) مبطنة بطبقات من الفوم الهوائي لامتصاص الصدمات وحماية الورود والبراويز الزجاجية من أي اهتزاز أثناء الطريق.</p>
        `
      },
      {
        title: "سرية التوصيل والمفاجآت الخاصة",
        icon: "fa-user-secret",
        content: `
          <p>في حال كان الطلب هدية أو مفاجأة لشخص آخر، يلتزم المندوب بالسرية التامة بعدم ذكر السعر أو اسم المرسل للمستلم إلا إذا رغب العميل بذلك، لضمان فرحة المفاجأة التامة لمتلقي الهدية.</p>
        `
      },
      {
        title: "شروط وإرشادات التسليم الحازمة",
        icon: "fa-exclamation-triangle",
        content: `
          <ul>
            <li>يشترط لخدمة التوصيل بنفس اليوم تأكيد الطلب قبل الساعة ٥:٠٠ مساءً.</li>
            <li>يقوم المندوب بالتواصل مع المستلم هاتفياً قبل التحرك بنصف ساعة لتأكيد التواجد.</li>
            <li>في حال تعذر الوصول للعنوان أو عدم الرد على اتصالات المندوب بعد محاولتين، يُعاد الأوردر لمقر المتجر ويتم تحديد موعد تسليم جديد مع احتساب رسوم مشوار شحن إضافية للمندوب.</li>
            <li>يرجى فحص مظهر الباقة الخارجي أمام المندوب مباشرة قبل مغادرته والتوقيع على إشعار الاستلام.</li>
          </ul>
        `
      }
    ]
  },
  refund: {
    id: "refund",
    title: "سياسة الاستبدال والاسترجاع الحازمة",
    icon: "fa-exchange-alt",
    colorClass: "green",
    badgeText: "سياسة عادلة وحازمة",
    updatedDate: "أكتوبر ٢٠٢٦",
    alertType: "red",
    alertIcon: "fa-exclamation-triangle",
    alertColor: "#C0392B",
    alertText: "نظراً لأن جميع منتجات شذى تُصنع وتُخصص يدوياً خصيصاً لكل عميل حسب رغبته (Custom Handmade)، لا يُقبل الإلغاء أو استرجاع المبالغ النقدية لمجرد تغيير الرأي بعد بدء التصنيع.",
    sections: [
      {
        title: "الحالات المعتمدة للاستبدال الفوري",
        icon: "fa-check-circle",
        content: `
          <p>يحق للعميل طلب الاستبدال المجاني الفوري في الحالات التالية حصراً:</p>
          <ul>
            <li><strong>تلف أو كسر ناتج عن الشحن:</strong> يُخطر به المتجر خلال ٢٤ ساعة كحد أقصى من وقت الاستلام مرفقاً بصور أو فيديو واضح.</li>
            <li><strong>عدم مطابقة المواصفات المعتمدة:</strong> في حال وجود خطأ في اللون أو الحجم أو التطريز مخالف لما تم توثيقه في رسائل التأكيد على واتساب.</li>
            <li><strong>عيب مصنعي واضح:</strong> وجود خلل أو تفكك في تثبيت الباقة أو هيكل الصندوق قبل أي استخدام.</li>
          </ul>
        `
      },
      {
        title: "الحالات التي لا يُقبل فيها الاستبدال أو الإرجاع",
        icon: "fa-times-circle",
        content: `
          <ul>
            <li>تراجع العميل أو تغيير رأيه بعد بدء التصنيع والقص الفعلي للخامات.</li>
            <li>اختيار المقاس أو اللون غير المناسب بمعرفة العميل رغم مطابقة المنتج لطلبه.</li>
            <li>المنتجات المطرزة بأسماء مخصصة أو تواريخ عقد قران أو نصوص إهداء شخصية.</li>
            <li>التلف الناتج عن سوء التخزين، أو التعرض للماء أو الحرارة، أو فك الأجزاء بعد الاستلام.</li>
            <li>مرور أكثر من ٢٤ ساعة على استلام الطلب دون إشعار خدمة العملاء.</li>
          </ul>
        `
      },
      {
        title: "إجراءات وخطوات تقديم طلب الاستبدال",
        icon: "fa-clipboard-list",
        content: `
          <p>تتم مراجعة طلبات الاستبدال بمنتهى الشفافية والسرعة وفق الخطوات التالية:</p>
          <ul>
            <li>إرسال رقم الطلب وصورة واضحة للمنتج والمشكلة إلى رقم خدمة العملاء عبر واتساب.</li>
            <li>يقوم المشرف المختص بفحص الطلب والرد خلال ساعتي عمل كحد أقصى.</li>
            <li>عند الموافقة على الاستبدال، يتم إرسال مندوب لاستلام القطعة المعيبة وتسليم القطعة الجديدة فوراً دون أي تكلفة شحن إضافية.</li>
          </ul>
          <a href="https://wa.me/201102541236?text=مرحباً، أود تقديم طلب استبدال لمنتج مستلم" target="_blank" class="policy-wa-btn">
            <i class="fab fa-whatsapp"></i> فتح تذكرة استبدال سريعة
          </a>
        `
      },
      {
        title: "إمكانية التعديل قبل بدء التنفيذ",
        icon: "fa-pen",
        content: `
          <p>يحق لكِ تعديل أي تفاصيل في الطلب (نص كارت الإهداء، لون شريطة التغليف) مجاناً عبر الواتساب خلال ساعتين من تأكيد الطلب، وقبل دخول الطلب لخط القص والتنفيذ الفعلي.</p>
        `
      }
    ]
  },
  terms: {
    id: "terms",
    title: "الشروط والأحكام واتفاقية الاستخدام",
    icon: "fa-file-contract",
    colorClass: "purple",
    badgeText: "اتفاقية قانونية ملزمة",
    updatedDate: "أكتوبر ٢٠٢٦",
    alertType: "info",
    alertIcon: "fa-gavel",
    alertColor: "#7D3C98",
    alertText: "استخدامك لموقع شذى أو إرسالك لأي طلب شراء عبر الموقع أو الواتساب يُعد إقراراً وموافقة قانونية ملزمة وكاملة على كافة البنود والسياسات الموضحة أدناه.",
    sections: [
      {
        title: "١. التعريف بالعلامة التجارية",
        icon: "fa-store",
        content: `
          <p>«متجر شَـذى 🌸» علامة تجارية مصرية رائدة مسجلة متخصصة في صناعة وتصميم الهدايا اليدوية الفاخرة، بوكيهات الورد الستان، تجهيزات العرسان وكتب الكتاب. يخضع المتجر لكافة القوانين والتشريعات التجارية المعمول بها في جمهورية مصر العربية.</p>
        `
      },
      {
        title: "٢. آلية اعتماد وتأكيد الطلبات",
        icon: "fa-shopping-cart",
        content: `
          <p>يُعتبر الطلب مؤكداً ومدرجاً في جدول العمل فقط بعد إتمام العميل لسداد الدفعة المقدمة (العربون) بنسبة لا تقل عن ٥٠٪ من إجمالي القيمة عبر المحافظ الإلكترونية المعتمدة (إنستاباي / فودافون كاش / بطاقات بنكية) وتلقي رسالة تأكيد رسمية من فريق خدمة عملاء شذى.</p>
          <p>يحتفظ المتجر بالحق في الاعتذار عن قبول أي طلب في حال تعذر توفير الموعد المطلوب أو عدم وضوح بيانات العميل.</p>
        `
      },
      {
        title: "٣. سياسة الأسعار والرسوم",
        icon: "fa-tags",
        content: `
          <ul>
            <li>جميع الأسعار المعلنة بالجنيه المصري (EGP) وتشمل كارت الإهداء والتغليف الفاخر مجاناً.</li>
            <li>تُحدد رسوم التوصيل بشكل منفصل وفقاً للمنطقة والمحافظة وتُوضح للعميل قبل السداد.</li>
            <li>الأسعار سارية ومعتمدة وقت إتمام وتأكيد الحجز، ولا تسري عليها أي تحديثات سعرية لاحقة.</li>
          </ul>
        `
      },
      {
        title: "٤. مطابقة الألوان والمواصفات اليدوية",
        icon: "fa-palette",
        content: `
          <p>نظراً للطبيعة اليدوية الخالصة واختلاف إعدادات ودقة شاشات الهواتف، قد يطرأ فارق لوني طفيف جداً في درجات أشرطة الستان أو الإضاءة، ولا يُعد ذلك عيباً مصنعياً. نلتزم دائماً بالحفاظ على أرقى تناغم بصري ملكي معتمد في صور المعرض.</p>
        `
      },
      {
        title: "٥. حقوق الملكية الفكرية والعلامة التجارية",
        icon: "fa-copyright",
        content: `
          <p>كافة الصور، الفيديوهات، النصوص، الهوية البصرية، وتصميمات الباقات والبراويز المنشورة على هذا الموقع مملوكة حصرياً لعلامة "شذى". يُحظر تماماً اقتباسها، أو إعادة نشرها، أو استخدامها في أغراض تجارية أو ترويجية دون موافقة خطية صريحة مسبقة.</p>
        `
      },
      {
        title: "٦. القانون المطبق وفض النزاعات",
        icon: "fa-balance-scale",
        content: `
          <p>تخضع هذه الاتفاقية وتُفسر وفقاً لأحكام القوانين المصرية. ويختص القضاء المصري بالنظر في أي نزاع قد ينشأ بخصوص المعاملات المنفذة عبر المتجر.</p>
        `
      }
    ]
  },
  privacy: {
    id: "privacy",
    title: "سياسة الخصوصية وأمان البيانات المشدد",
    icon: "fa-lock",
    colorClass: "red",
    badgeText: "خصوصية وأمان 100%",
    updatedDate: "أكتوبر ٢٠٢٦",
    alertType: "green",
    alertIcon: "fa-shield-halved",
    alertColor: "#1A8C4E",
    alertText: "نلتزم في متجر شذى بأقصى معايير السرية والأمان في التعامل مع بيانات عملائنا ورسائل إهدائهم الخاصة، ونضمن عدم مشاركتها أو بيعها لأي جهة تسويقية إطلاقاً.",
    sections: [
      {
        title: "١. البيانات التي يتم جمعها والغرض منها",
        icon: "fa-database",
        content: `
          <p>نقوم بجمع البيانات الضرورية فقط واللازمة لإنجاز وتوصيل طلبك:</p>
          <ul>
            <li><strong>بيانات العميل:</strong> الاسم، رقم الهاتف، عنوان التوصيل التفصيلي — للتنسيق والتسليم بواسطة المندوب.</li>
            <li><strong>نصوص وتفاصيل الإهداء:</strong> رسائل كروت الإهداء، أسماء العروسين وتاريخ المناسبة — لطباعتها وتطريزها على المنتجات بدقة.</li>
            <li><strong>سجل المحادثات:</strong> للاحتفاظ بسجل الطلب ومواصفاته لضمان حقوق العميل ومطابقة التنفيذ.</li>
          </ul>
        `
      },
      {
        title: "٢. الأمان وحماية البيانات الحساسة",
        icon: "fa-user-lock",
        content: `
          <p>تُخزن بيانات العملاء في بيئة رقمية محمية ومقفلة، ولا يُسمح بالوصول إليها إلا لمسؤول التجهيز والمندوب المختص بتوصيل الطلب فقط. لا نحتفظ أو نطلب أي أرقام بطاقات بنكية أو أرقام سرية إطلاقاً، وتتم المدفوعات عبر الروابط الرسمية المعتمدة.</p>
        `
      },
      {
        title: "٣. سرية رسائل ومناسبات العرسان",
        icon: "fa-envelope-open-text",
        content: `
          <p>نولي مشاعر عملائنا ورسائلهم الخاصة حرمة تامة وأمانة مطلقة. تُطبع رسائل كروت الإهداء وتوضع داخل أظرف شمعية مغلقة ومختومة مباشرة في المعمل دون اطلاع المندوب أو أي طرف خارجي على محتواها.</p>
        `
      },
      {
        title: "٤. حق العميل في حذف وتعديل بياناته",
        icon: "fa-trash-alt",
        content: `
          <p>يحق لأي عميل طلب مسح بياناته المسجلة وسجل أرقامه من سجلات المتجر فور استلام طلبه بنجاح، عن طريق توجيه طلب بسيط لخدمة العملاء عبر واتساب، ويتم تنفيذ المسح خلال ٢٤ ساعة عمل.</p>
          <a href="https://wa.me/201102541236?text=مرحباً، أود طلب حذف بياناتي المسجلة من قاعدة بيانات شذى" target="_blank" class="policy-wa-btn">
            <i class="fab fa-whatsapp"></i> طلب مسح بياناتي فوراً
          </a>
        `
      },
      {
        title: "٥. ملفات تعريف الارتباط (Cookies)",
        icon: "fa-cookie-bite",
        content: `
          <p>يستخدم الموقع ملفات تعريف ارتباط فنية فقط لحفظ المنتجات داخل سلة الشراء وتذكر تفضيلات المظهر (الوضع الليلي والنهاري)، ولا نستخدم أي برمجيات تتبع خبيثة أو إعلانات خارجية متطفلة.</p>
        `
      }
    ]
  }
};

function openPolicyModal(policyType = "guarantee") {
  closeAllModals();

  const policy = SHATHA_POLICIES_DATA[policyType] || SHATHA_POLICIES_DATA.guarantee;

  let modal = document.getElementById("universalPolicyModal");
  if (!modal) {
    modal = document.createElement("section");
    modal.id = "universalPolicyModal";
    modal.className = "policy-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
  }

  let backdrop = document.getElementById("modalBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "modalBackdrop";
    backdrop.className = "modal-backdrop";
    backdrop.onclick = closeUniversalPolicyModal;
    document.body.appendChild(backdrop);
  } else {
    backdrop.onclick = closeUniversalPolicyModal;
  }

  // توليد أزرار التبويبات العلوية السريعة
  const tabKeys = [
    { key: "guarantee", label: "ضمان الجودة", icon: "fa-award" },
    { key: "delivery", label: "الشحن والتوصيل", icon: "fa-truck-fast" },
    { key: "refund", label: "الاستبدال والاسترجاع", icon: "fa-exchange-alt" },
    { key: "terms", label: "الشروط والأحكام", icon: "fa-file-contract" },
    { key: "privacy", label: "سياسة الخصوصية", icon: "fa-lock" }
  ];

  const tabsHtml = `
    <div class="policy-tabs-nav" id="policyTabsNav">
      ${tabKeys.map(t => `
        <button type="button" class="policy-tab-btn ${t.key === policy.id ? 'active' : ''}" onclick="switchPolicyTab('${t.key}')">
          <i class="fas ${t.icon}"></i> <span>${t.label}</span>
        </button>
      `).join('')}
    </div>
  `;

  // توليد أقسام السياسة
  const sectionsHtml = policy.sections.map(sec => `
    <div class="policy-section">
      <div class="policy-section-title">
        <i class="fas ${sec.icon}"></i> <span>${sec.title}</span>
      </div>
      <div>${sec.content}</div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="policy-modal-header">
      <div class="policy-modal-icon ${policy.colorClass}">
        <i class="fas ${policy.icon}"></i>
      </div>
      <div class="policy-modal-header-text">
        <h3>${policy.title}</h3>
        <span class="policy-updated">${policy.badgeText} • آخر تحديث: ${policy.updatedDate}</span>
      </div>
      <button type="button" class="policy-modal-close-btn" onclick="closeUniversalPolicyModal()" aria-label="إغلاق">
        <i class="fas fa-times"></i>
      </button>
    </div>

    ${tabsHtml}

    <div class="policy-modal-body">
      <div class="policy-alert-box ${policy.alertType}">
        <i class="fas ${policy.alertIcon}" style="color: ${policy.alertColor}"></i>
        <p>${policy.alertText}</p>
      </div>

      ${sectionsHtml}
    </div>
  `;

  // إخفاء أي مودالات قديمة ثابتة في الصفحة لتفادي التداخل
  ["guarantee", "delivery", "refund", "terms", "privacy"].forEach(p => {
    const oldM = document.getElementById(`policyModal-${p}`);
    if (oldM && oldM !== modal) oldM.style.display = "none";
  });

  modal.classList.add("active");
  backdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

function switchPolicyTab(policyKey) {
  openPolicyModal(policyKey);
}

function closeUniversalPolicyModal() {
  const modal = document.getElementById("universalPolicyModal");
  if (modal) modal.classList.remove("active");
  const backdrop = document.getElementById("modalBackdrop");
  if (backdrop) backdrop.classList.remove("active");
  document.body.style.overflow = "";

  ["guarantee", "delivery", "refund", "terms", "privacy"].forEach(p => {
    const oldM = document.getElementById(`policyModal-${p}`);
    if (oldM) oldM.classList.remove("active");
  });
}

function closePolicyModal(policyType) {
  closeUniversalPolicyModal();
}

window.openPolicyModal = openPolicyModal;
window.closePolicyModal = closePolicyModal;
window.switchPolicyTab = switchPolicyTab;
window.closeUniversalPolicyModal = closeUniversalPolicyModal;


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

/* ==========================================================================
   Google Sign-In & Individual Discount Coupon Engine
   نظام تسجيل الدخول بحساب Google وتوليد كود خصم فردي 10% لكل حساب (استخدام لمرة واحدة)
   ========================================================================== */

/* ==========================================================================
   نظام حسابات شذى المتكامل (Authentication & Account Management System)
   - أيقونة دائرية متوافقة 100% مع شاشات الهواتف
   - تسجيل فوري برقم الهاتف والبريد الإلكتروني وحساب Google
   - توليد كلمة سر فريدة للحساب مع تنبيه لقطة الشاشة (Screenshot Alert)
   - تسجيل الدخول بالحساب القديم برقم الهاتف وكلمة السر
   - التعبئة التلقائية لرقم الهاتف عند الشراء مع إمكانية تعديله
   ========================================================================== */

/**
 * جلب سجل الحسابات المسجلة محلياً
 */
function getRegisteredAccounts() {
  try {
    const raw = localStorage.getItem('shatha_registered_accounts');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * حفظ أو تحديث حساب في السجل المحلي
 */
function saveRegisteredAccount(account) {
  try {
    if (!account || !account.id) return;
    const list = getRegisteredAccounts();
    const idx = list.findIndex(a => 
      a.id === account.id || 
      (account.email && a.email && a.email.toLowerCase() === account.email.toLowerCase()) || 
      (account.phone && a.phone && a.phone.replace(/\D/g, '') === account.phone.replace(/\D/g, ''))
    );
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...account };
    } else {
      list.push(account);
    }
    localStorage.setItem('shatha_registered_accounts', JSON.stringify(list));
  } catch (e) {
    console.warn("Error saving account:", e);
  }
}

/**
 * توليد كلمة سر عشوائية فريدة للحساب
 */
function generateSecretPassword() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SH-${code}`;
}

/**
 * تحميل المستخدم الحالي النشط
 */
function loadCurrentUser() {
  try {
    const saved = localStorage.getItem('shatha_google_user');
    if (saved) {
      const user = JSON.parse(saved);
      // فحص حالة استهلاك الكود من سجل الأكواد المستهلكة
      const usedStatus = localStorage.getItem(`shatha_coupon_used_${user.id}`) === 'true';
      user.couponUsed = usedStatus;
      if (!user.secretPassword) {
        user.secretPassword = generateSecretPassword();
        saveRegisteredAccount(user);
        localStorage.setItem('shatha_google_user', JSON.stringify(user));
      }
      // التحقق الصارم من هوية المالك: البريد الإلكتروني فقط
      const cleanEmail = (user.email || "").toLowerCase().trim();
      if (cleanEmail === SHATHA_CONFIG.ownerEmail.toLowerCase().trim()) {
        user.isOwner = true;
        localStorage.setItem('shatha_owner_session', 'true');
      } else {
        // إذا لم يكن مالكاً، أزل أي صلاحيات مالك قد تكون مخزنة
        user.isOwner = false;
        localStorage.removeItem('shatha_owner_session');
      }
      appState.currentUser = user;
    } else {
      // لا توجد جلسة محفوظة — أزل أي بقايا صلاحيات المالك
      localStorage.removeItem('shatha_owner_session');
    }
  } catch (e) {
    console.warn("Error loading user:", e);
  }
}


/**
 * تهيئة Google Identity Services وأزرار الدخول
 */
function initGoogleSignIn() {
  updateAuthUI();

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    setTimeout(initGoogleSignIn, 600);
    return;
  }

  try {
    google.accounts.id.initialize({
      client_id: SHATHA_CONFIG.googleClientId,
      callback: handleGoogleSignInResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    const btnContainer = document.getElementById("googleSignInBtnTop");
    if (btnContainer && !appState.currentUser) {
      btnContainer.innerHTML = "";
      google.accounts.id.renderButton(btnContainer, {
        theme: "outline",
        size: "medium",
        type: "standard",
        text: "signin_with",
        shape: "pill",
        logo_alignment: "right"
      });
    }

    const newsletterBtn = document.getElementById("googleSignInBtnNewsletter");
    if (newsletterBtn && !appState.currentUser) {
      newsletterBtn.innerHTML = "";
      google.accounts.id.renderButton(newsletterBtn, {
        theme: "filled_blue",
        size: "large",
        type: "standard",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "right"
      });
    }

    const modalGoogleBtn = document.getElementById("googleSignInBtnModal");
    if (modalGoogleBtn && !appState.currentUser) {
      modalGoogleBtn.innerHTML = "";
      google.accounts.id.renderButton(modalGoogleBtn, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "right"
      });
    }
  } catch (e) {
    console.error("Google Sign-In Init Error:", e);
  }
}

/**
 * معالجة استجابة تسجيل الدخول بحساب Google
 */
function handleGoogleSignInResponse(response) {
  try {
    const payload = parseJwt(response.credential);
    if (!payload || !payload.sub) {
      showToast("حدث خطأ أثناء قراءة بيانات الحساب", "error");
      return;
    }

    const googleId = payload.sub;
    const name = payload.name || "عميل شذى";
    const email = payload.email || "";
    const picture = payload.picture || "assets/images/logo.jpg";

    registerOrLoginUser({
      name: name,
      email: email,
      phone: "",
      picture: picture,
      googleId: googleId,
      fromGoogle: true
    });

  } catch (err) {
    console.error("JWT Decode Error:", err);
    showToast("تعذر إتمام تسجيل الدخول بحساب Google", "error");
  }
}

/**
 * فك تشفير JWT الخاص بجوجل
 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

/**
 * توليد كود خصم فريد 10% لكل حساب
 */
function generateUniqueCouponForUser(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  const codeSuffix = Math.abs(hash).toString(36).toUpperCase().padStart(5, '0').slice(0, 5);
  return `SHATHA-${codeSuffix}`;
}

/**
 * تسجيل حساب جديد أو الدخول بحساب مطابق
 */
function registerOrLoginUser({ name, email, phone, picture, googleId, fromGoogle = false }) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPhone = (phone || "").trim();
  const cleanName = (name || "").trim() || "عميل متجر شذى";

  const accounts = getRegisteredAccounts();

  // فحص وجود حساب سابق بنفس الهاتف أو البريد
  let existingUser = accounts.find(a => 
    (cleanPhone && a.phone && a.phone.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '')) ||
    (cleanEmail && a.email && a.email.toLowerCase() === cleanEmail) ||
    (googleId && a.id === googleId)
  );

  if (existingUser) {
    // حساب قديم موجود بالفعل
    if (cleanPhone && !existingUser.phone) existingUser.phone = cleanPhone;
    if (picture && picture !== "assets/images/logo.jpg") existingUser.picture = picture;
    if (!existingUser.secretPassword) existingUser.secretPassword = generateSecretPassword();

    // التحقق من هوية المالك بالبريد الإلكتروني فقط
    if (existingUser.email && existingUser.email.toLowerCase().trim() === SHATHA_CONFIG.ownerEmail.toLowerCase().trim()) {
      existingUser.isOwner = true;
      localStorage.setItem('shatha_owner_session', 'true');
    } else {
      existingUser.isOwner = false;
      localStorage.removeItem('shatha_owner_session');
    }

    saveRegisteredAccount(existingUser);
    appState.currentUser = existingUser;
    localStorage.setItem('shatha_google_user', JSON.stringify(existingUser));

    updateAuthUI();
    closeShathaAuthModal();

    showToast(`مرحباً بك مجدداً يا ${existingUser.name.split(' ')[0]}! تم تسجيل دخولك لحسابك القديم 🌸`, "success");

    if (!existingUser.couponUsed) {
      applyCouponCode(existingUser.couponCode);
    }
    return existingUser;
  }

  // إنشاء حساب جديد بالكامل
  const newId = googleId || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const secretPassword = generateSecretPassword();
  const couponCode = generateUniqueCouponForUser(newId);

  const newUser = {
    id: newId,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    picture: picture || "assets/images/logo.jpg",
    secretPassword: secretPassword,
    couponCode: couponCode,
    couponUsed: false,
    createdAt: new Date().toISOString()
  };

  saveRegisteredAccount(newUser);
  appState.currentUser = newUser;
  localStorage.setItem('shatha_google_user', JSON.stringify(newUser));

  updateAuthUI();
  closeShathaAuthModal();

  // إظهار نافذة كلمة السر والتنبيه بأخذ سكرين شوت
  showSecretPasswordModal(secretPassword, couponCode);

  showToast(`أهلاً بك يا ${cleanName}! تم تفعيل حسابك وحصلت على خصم 10% 🌸`, "success");

  applyCouponCode(couponCode);
  return newUser;
}

/**
 * معالجة استمارة إنشاء حساب جديد من المودال
 */
function handleRegistrationSubmit(e) {
  e?.preventDefault();
  const name = document.getElementById("regName")?.value.trim();
  const phone = document.getElementById("regPhone")?.value.trim();
  const email = document.getElementById("regEmail")?.value.trim();

  if (!phone || phone.length < 9) {
    showToast("يرجى إدخال رقم هاتف صحيح للتواصل", "error");
    return;
  }
  if (!email || !email.includes("@")) {
    showToast("يرجى إدخال بريد إلكتروني صحيح", "error");
    return;
  }

  registerOrLoginUser({
    name: name,
    phone: phone,
    email: email,
    picture: "assets/images/logo.jpg"
  });
}

/**
 * معالجة استمارة تسجيل الدخول لحساب سابق بواسطة الهاتف/البريد وكلمة السر
 */
function handleLoginSubmit(e) {
  e?.preventDefault();
  const identifier = (document.getElementById("loginIdentifier")?.value || "").trim();
  const password = (document.getElementById("loginPassword")?.value || document.getElementById("loginSecretPassword")?.value || "").trim();

  if (!identifier) {
    showToast("يرجى إدخال رقم الهاتف أو البريد الإلكتروني", "error");
    return;
  }

  const cleanId = identifier.toLowerCase();
  const cleanPhone = identifier.replace(/\D/g, '');
  const cleanPass = password.toUpperCase();

  // التحقق من هوية المالك بالبريد الإلكتروني فقط (لا يُقبل رقم الهاتف للدخول كمالك)
  const isOwnerId = (cleanId === SHATHA_CONFIG.ownerEmail.toLowerCase().trim());

  const accounts = getRegisteredAccounts();

  // فحص الحساب ومطابقة كلمة السر
  let matched = accounts.find(a => {
    const phoneMatch = cleanPhone && a.phone && a.phone.replace(/\D/g, '') === cleanPhone;
    const emailMatch = a.email && a.email.toLowerCase() === cleanId;
    return (phoneMatch || emailMatch);
  });

  // إذا كان المستخدم هو مالك المتجر (بالبريد الإلكتروني فقط)
  if (isOwnerId) {
    if (!matched) {
      matched = {
        id: 'owner_shatha_account',
        name: 'مالك ومدير متجر شذى',
        email: SHATHA_CONFIG.ownerEmail,
        phone: SHATHA_CONFIG.whatsappNumber,
        picture: 'assets/images/logo.jpg',
        secretPassword: password || 'SH-OWNER',
        couponCode: 'SHATHA-OWNER',
        couponUsed: false,
        isOwner: true
      };
      saveRegisteredAccount(matched);
    }
    matched.isOwner = true;
    localStorage.setItem('shatha_owner_session', 'true');
    appState.currentUser = matched;
    localStorage.setItem('shatha_google_user', JSON.stringify(matched));

    updateAuthUI();
    closeShathaAuthModal();
    showToast("👑 أهلاً بك يا مالك المتجر! تم تسجيل الدخول وتفعيل لوحة الإدارة وإضافة المنتجات.", "success");
    return;
  }

  if (!matched) {
    showToast("لم نجد حساباً مسجلاً بهذا الهاتف أو البريد. يمكنك إنشاء حساب جديد بسهولة!", "error");
    return;
  }

  if (matched.secretPassword && cleanPass && matched.secretPassword.toUpperCase() !== cleanPass) {
    showToast("كلمة السر غير صحيحة! يرجى مراجعة لقطة الشاشة (السكرين شوت) الخاصة بحسابك.", "error");
    return;
  }

  // تم التحقق بنجاح — تأكد من إزالة صلاحيات المالك لأي حساب آخر
  matched.isOwner = false;
  localStorage.removeItem('shatha_owner_session');
  appState.currentUser = matched;
  localStorage.setItem('shatha_google_user', JSON.stringify(matched));

  updateAuthUI();
  closeShathaAuthModal();

  showToast(`أهلاً بعودتك يا ${matched.name.split(' ')[0]}! تم تسجيل الدخول بنجاح 🌸`, "success");

  if (!matched.couponUsed) {
    applyCouponCode(matched.couponCode);
  }
}


// دوال متوافقة مع كافة النماذج بصفحات المتجر
function handleManualLoginSubmit(e) {
  handleLoginSubmit(e);
}
function handleManualRegisterSubmit(e) {
  handleRegistrationSubmit(e);
}

/**
 * معالجة استمارة "انضمي لعالم شذى الزهري" في الصفحة الرئيسية
 */
function handleNewsletterJoinSubmit(e) {
  e?.preventDefault();
  const phone = document.getElementById("newsletterPhone")?.value.trim();
  const email = document.getElementById("newsletterEmail")?.value.trim();
  const name = document.getElementById("newsletterName")?.value.trim() || "عميل شذى";

  if (!phone || phone.length < 9) {
    showToast("يرجى إدخال رقم هاتف واتساب صحيح للتواصل", "error");
    return;
  }
  if (!email || !email.includes("@")) {
    showToast("يرجى إدخال بريد إلكتروني صحيح", "error");
    return;
  }

  registerOrLoginUser({
    name: name,
    phone: phone,
    email: email,
    picture: "assets/images/logo.jpg"
  });

  // تفريغ الحقول
  if (document.getElementById("newsletterPhone")) document.getElementById("newsletterPhone").value = "";
  if (document.getElementById("newsletterEmail")) document.getElementById("newsletterEmail").value = "";
  if (document.getElementById("newsletterName")) document.getElementById("newsletterName").value = "";
}

/**
 * فتح النافذة المناسبة عند النقر على الأيقونة الدائرية في الهيدر
 */
function openAccountOrAuthModal() {
  if (appState.currentUser) {
    openShathaAccountModal();
  } else {
    openShathaAuthModal();
  }
}

/**
 * فتح نافذة تسجيل الدخول وعضوية شذى
 */
function openShathaAuthModal() {
  const modal = document.getElementById("shathaAuthModal");
  const backdrop = document.getElementById("modalBackdrop");
  if (!modal) return;

  // إعادة ضبط جوجل زر المودال
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    const modalGoogleBtn = document.getElementById("googleSignInBtnModal");
    if (modalGoogleBtn) {
      modalGoogleBtn.innerHTML = "";
      google.accounts.id.renderButton(modalGoogleBtn, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "right"
      });
    }
  }

  backdrop?.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

/**
 * إغلاق نافذة تسجيل الدخول
 */
function closeShathaAuthModal() {
  document.getElementById("shathaAuthModal")?.classList.remove("active");
  const hasOtherModal = document.querySelector(".checkout-modal.active, .account-modal-wrap.active, .product-modal.active");
  if (!hasOtherModal) {
    document.getElementById("modalBackdrop")?.classList.remove("active");
    document.body.style.overflow = "";
  }
}

/**
 * التبديل بين تبويبات تسجيل الدخول وإنشاء حساب
 */
function switchAuthTab(tab) {
  const btnReg = document.getElementById("tabBtnRegister");
  const btnLog = document.getElementById("tabBtnLogin");
  const paneReg = document.getElementById("paneRegister") || document.getElementById("authRegisterView");
  const paneLog = document.getElementById("paneLogin") || document.getElementById("authLoginView");

  if (tab === 'register') {
    btnReg?.classList.add("active");
    btnLog?.classList.remove("active");
    if (paneReg) { paneReg.classList.add("active"); paneReg.style.display = "block"; }
    if (paneLog) { paneLog.classList.remove("active"); paneLog.style.display = "none"; }
  } else {
    btnLog?.classList.add("active");
    btnReg?.classList.remove("active");
    if (paneLog) { paneLog.classList.add("active"); paneLog.style.display = "block"; }
    if (paneReg) { paneReg.classList.remove("active"); paneReg.style.display = "none"; }
  }
}

/**
 * إظهار نافذة كلمة السر والتنبيه بأخذ سكرين شوت
 */
function showSecretPasswordModal(password, coupon) {
  const modal = document.getElementById("secretPasswordModal");
  const backdrop = document.getElementById("modalBackdrop");
  if (!modal) return;

  const passDisplay = document.getElementById("displaySecretPassword");
  const couponDisplay = document.getElementById("displayCouponAfterReg");

  if (passDisplay) passDisplay.innerText = password;
  if (couponDisplay) couponDisplay.innerText = coupon;

  backdrop?.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

/**
 * إغلاق نافذة كلمة السر
 */
function closeSecretPasswordModal() {
  document.getElementById("secretPasswordModal")?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

/**
 * نسخ كلمة السر الجديدة
 */
function copySecretPassword() {
  const pass = document.getElementById("displaySecretPassword")?.innerText.trim();
  if (pass) {
    navigator.clipboard?.writeText(pass);
    showToast(`تم نسخ كلمة السر (${pass}) بنجاح! احتفظ بها في مكان آمن 📸`, "success");
  }
}

/**
 * نسخ كلمة السر من صفحة معلومات الحساب
 */
function copyMySecretPassword() {
  if (appState.currentUser && appState.currentUser.secretPassword) {
    navigator.clipboard?.writeText(appState.currentUser.secretPassword);
    showToast(`تم نسخ كلمة السر (${appState.currentUser.secretPassword}) بنجاح! 🔐`, "success");
  } else {
    showToast("تعذر نسخ كلمة السر", "error");
  }
}

/**
 * إظهار/إخفاء كلمة السر في صفحة معلومات الحساب
 */
let isAccountPasswordVisible = false;
function toggleShowAccountPassword() {
  const elem = document.getElementById("accModalPassword");
  const icon = document.getElementById("accEyeIcon");
  if (!elem || !appState.currentUser) return;

  isAccountPasswordVisible = !isAccountPasswordVisible;
  if (isAccountPasswordVisible) {
    elem.innerText = appState.currentUser.secretPassword || "SH-SHATHA";
    if (icon) icon.className = "fas fa-eye-slash";
  } else {
    elem.innerText = (appState.currentUser.secretPassword || "SH-SHATHA").replace(/./g, '•');
    if (icon) icon.className = "fas fa-eye";
  }
}

/**
 * إظهار/إخفاء حقل كلمة السر في فورم الدخول
 */
function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (icon) icon.className = "fas fa-eye-slash";
  } else {
    input.type = "password";
    if (icon) icon.className = "fas fa-eye";
  }
}

/**
 * فتح صفحة/نافذة معلومات الحساب الكاملة
 */
function openShathaAccountModal() {
  const user = appState.currentUser;
  if (!user) {
    openShathaAuthModal();
    return;
  }

  const modal = document.getElementById("shathaAccountModal");
  const backdrop = document.getElementById("modalBackdrop");
  if (!modal) return;

  // تحديث محتويات النافذة
  const avatar = document.getElementById("accModalAvatar");
  const name = document.getElementById("accModalName");
  const phone = document.getElementById("accModalPhone");
  const email = document.getElementById("accModalEmail");
  const pwd = document.getElementById("accModalPassword");
  const couponCode = document.getElementById("accModalCouponCode");
  const couponStatus = document.getElementById("accModalCouponStatus");
  const cartCount = document.getElementById("accModalCartItemsCount");
  const ownerSec = document.getElementById("accOwnerSection");
  const role = document.getElementById("accModalRole");

  if (avatar) avatar.src = user.picture || "assets/images/logo.jpg";
  if (name) name.innerText = user.name;
  if (phone) phone.innerText = user.phone || "لم يتم تسجيل رقم بعد (اضغط تعديل)";
  if (email) email.innerText = user.email || "غير متوفر";
  
  isAccountPasswordVisible = false;
  if (pwd) pwd.innerText = (user.secretPassword || "SH-SHATHA").replace(/./g, '•');
  const eyeIcon = document.getElementById("accEyeIcon");
  if (eyeIcon) eyeIcon.className = "fas fa-eye";

  if (couponCode) couponCode.innerText = user.couponCode;

  const isUsed = localStorage.getItem(`shatha_coupon_used_${user.id}`) === 'true';
  if (couponStatus) {
    if (isUsed) {
      couponStatus.innerText = "تم استهلاك الكود سابقاً";
      couponStatus.classList.add("used");
    } else {
      couponStatus.innerText = "متاح للاستخدام (مرة واحدة)";
      couponStatus.classList.remove("used");
    }
  }

  if (cartCount) {
    cartCount.innerText = `${appState.cart.length} باقات في السلة`;
  }

  const isOwner = user.email && user.email.toLowerCase().trim() === SHATHA_CONFIG.ownerEmail.toLowerCase().trim();
  if (ownerSec) {
    ownerSec.style.display = isOwner ? "block" : "none";
    if (isOwner) checkCloudStatusBackground();
  }
  if (role) {
    role.innerHTML = isOwner 
      ? '<i class="fas fa-crown" style="color: #F39C12;"></i> مالك ومدير متجر شذى' 
      : '<i class="fas fa-heart" style="color: var(--primary-pink);"></i> عميل مميز لدى شذى';
  }

  // إخفاء فورم تعديل الرقم إذا كان مفتوحاً
  const editWrap = document.getElementById("accEditPhoneWrap");
  if (editWrap) editWrap.style.display = "none";

  backdrop?.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

/**
 * إغلاق نافذة معلومات الحساب
 */
function closeShathaAccountModal() {
  document.getElementById("shathaAccountModal")?.classList.remove("active");
  const hasOtherModal = document.querySelector(".checkout-modal.active, .account-modal-wrap.active, .product-modal.active");
  if (!hasOtherModal) {
    document.getElementById("modalBackdrop")?.classList.remove("active");
    document.body.style.overflow = "";
  }
}

/**
 * إظهار/إخفاء فورم تعديل رقم الهاتف
 */
function toggleEditPhone() {
  const wrap = document.getElementById("accEditPhoneWrap");
  const input = document.getElementById("accEditPhoneInput");
  if (!wrap) return;

  if (wrap.style.display === "none" || !wrap.style.display) {
    wrap.style.display = "flex";
    if (input) {
      input.value = appState.currentUser?.phone || "";
      input.focus();
    }
  } else {
    wrap.style.display = "none";
  }
}

/**
 * حفظ رقم الهاتف المعدل
 */
function saveEditedPhone() {
  const input = document.getElementById("accEditPhoneInput");
  const newPhone = input?.value.trim();
  if (!newPhone || newPhone.length < 8) {
    showToast("يرجى كتابة رقم هاتف صحيح", "error");
    return;
  }

  if (appState.currentUser) {
    appState.currentUser.phone = newPhone;
    saveRegisteredAccount(appState.currentUser);
    localStorage.setItem('shatha_google_user', JSON.stringify(appState.currentUser));

    const phoneDisplay = document.getElementById("accModalPhone");
    if (phoneDisplay) phoneDisplay.innerText = newPhone;

    toggleEditPhone();
    showToast(`تم تحديث رقم الهاتف بنجاح (${newPhone}) وسيتم تعبئته تلقائياً عند الشراء 🌸`, "success");
  }
}

/**
 * تحديث واجهة المستخدم (الأيقونة الدائرية، الكوبونات، أزرار الهيدر)
 */
function updateAuthUI() {
  const loggedOutBar = document.getElementById("authBarLoggedOut");
  const loggedInBar = document.getElementById("authBarLoggedIn");
  const newsletterBtn = document.getElementById("googleSignInBtnNewsletter");

  const userCircleIcon = document.getElementById("userCircleIcon");
  const userAvatarImg = document.getElementById("userAvatarImg");
  const userStatusDot = document.getElementById("userStatusDot");
  const headerUserCircleBtn = document.getElementById("headerUserCircleBtn");

  if (appState.currentUser) {
    const user = appState.currentUser;
    const isUsed = localStorage.getItem(`shatha_coupon_used_${user.id}`) === 'true';
    user.couponUsed = isUsed;

    // الأيقونة الدائرية الفاخرة للهيدر: عرض الصورة ونقطة الاتصال الخضراء دون أي نص
    if (userCircleIcon) userCircleIcon.style.display = "none";
    if (userAvatarImg) {
      userAvatarImg.style.display = "block";
      userAvatarImg.src = user.picture || "assets/images/logo.jpg";
    }
    if (userStatusDot) userStatusDot.style.display = "block";
    if (headerUserCircleBtn) {
      headerUserCircleBtn.setAttribute("title", `${user.name} (اضغط لعرض صفحة معلومات الحساب)`);
    }

    if (loggedOutBar) loggedOutBar.style.display = "none";
    if (loggedInBar) loggedInBar.style.display = "flex";
    if (newsletterBtn) newsletterBtn.style.display = "none";

    const nameElem = document.getElementById("loggedInUserName");
    const codeElem = document.getElementById("userCouponCode");
    const statusBadge = document.getElementById("couponStatusBadge");

    if (nameElem) nameElem.innerText = user.name.split(' ')[0];
    if (codeElem) codeElem.innerText = user.couponCode;

    if (statusBadge) {
      if (isUsed) {
        statusBadge.innerText = "تم استخدام الكود سابقاً";
        statusBadge.classList.add("used");
      } else {
        statusBadge.innerText = "متاح للاستخدام (مرة واحدة)";
        statusBadge.classList.remove("used");
      }
    }

    // التحقق الصارم من مالك المتجر: a4999360@gmail.com
    const isOwner = user.email && user.email.toLowerCase().trim() === SHATHA_CONFIG.ownerEmail.toLowerCase().trim();
    const navAdmin = document.getElementById("navAdminLink");
    const sectionAddBtn = document.getElementById("sectionAdminAddBtn");
    const footerAdmin = document.getElementById("footerAdminLink");
    const weddingAddBtn = document.getElementById("weddingOwnerAddBtn");

    if (navAdmin) navAdmin.style.display = isOwner ? "block" : "none";
    if (sectionAddBtn) sectionAddBtn.style.display = isOwner ? "inline-flex" : "none";
    if (footerAdmin) footerAdmin.style.display = isOwner ? "block" : "none";
    if (weddingAddBtn) weddingAddBtn.style.display = isOwner ? "inline-flex" : "none";

  } else {
    // حالة عدم تسجيل الدخول: الأيقونة دائرية بأيقونة المستخدم
    if (userCircleIcon) userCircleIcon.style.display = "inline-block";
    if (userAvatarImg) userAvatarImg.style.display = "none";
    if (userStatusDot) userStatusDot.style.display = "none";
    if (headerUserCircleBtn) {
      headerUserCircleBtn.setAttribute("title", "تسجيل الدخول / حسابي");
    }

    const navAdmin = document.getElementById("navAdminLink");
    const sectionAddBtn = document.getElementById("sectionAdminAddBtn");
    const footerAdmin = document.getElementById("footerAdminLink");
    const weddingAddBtn = document.getElementById("weddingOwnerAddBtn");
    if (navAdmin) navAdmin.style.display = "none";
    if (sectionAddBtn) sectionAddBtn.style.display = "none";
    if (footerAdmin) footerAdmin.style.display = "none";
    if (weddingAddBtn) weddingAddBtn.style.display = "none";

    if (loggedOutBar) loggedOutBar.style.display = "flex";
    if (loggedInBar) loggedInBar.style.display = "none";
    if (newsletterBtn) newsletterBtn.style.display = "flex";

    // إعادة رسم أزرار جوجل
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      const btnContainer = document.getElementById("googleSignInBtnTop");
      if (btnContainer) {
        btnContainer.innerHTML = "";
        google.accounts.id.renderButton(btnContainer, {
          theme: "outline",
          size: "medium",
          type: "standard",
          text: "signin_with",
          shape: "pill",
          logo_alignment: "right"
        });
      }

      if (newsletterBtn) {
        newsletterBtn.innerHTML = "";
        google.accounts.id.renderButton(newsletterBtn, {
          theme: "filled_blue",
          size: "large",
          type: "standard",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "right"
        });
      }
    }
  }

  // تحديث أدوات المالك فوراً على كروت المنتجات والواجهة والصندوق
  renderProducts();
  renderWeddingSection();
  if (typeof renderWeddingBoxCards === 'function') renderWeddingBoxCards();
  if (typeof initWeddingBoxShowcase === 'function') initWeddingBoxShowcase();
  if (typeof initHeroBouquetShowcase === 'function') initHeroBouquetShowcase();
}

/**
 * نسخ كود الخصم الخاص بالمستخدم وتطبيقه
 */
function copyMyCoupon() {
  if (!appState.currentUser) {
    showToast("يرجى تسجيل الدخول بحسابك أولاً للحصول على كود الخصم", "info");
    return;
  }

  const user = appState.currentUser;
  const isUsed = localStorage.getItem(`shatha_coupon_used_${user.id}`) === 'true';

  if (isUsed) {
    showToast("كود الخصم هذا تم استخدامه بالفعل مسبقاً! كل حساب له كود يعمل لمرة واحدة فقط.", "error");
    return;
  }

  navigator.clipboard?.writeText(user.couponCode);
  showToast(`تم نسخ كود خصمك (${user.couponCode}) وتطبيقه تلقائياً! 🎉`, "success");
  applyCouponCode(user.couponCode);
}

/**
 * تسجيل الخروج
 */
function handleGoogleSignOut() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }

  appState.currentUser = null;
  localStorage.removeItem('shatha_google_user');
  localStorage.removeItem('shatha_owner_session');
  
  appState.appliedCoupon = null;
  localStorage.removeItem('shatha_applied_coupon');
  
  closeShathaAccountModal();

  updateAuthUI();
  updateCartUI();
  if (typeof initWeddingBoxShowcase === 'function') initWeddingBoxShowcase();

  showToast("تم تسجيل الخروج بنجاح. أهلاً بك دائماً في شذى 🌸", "info");
}


/* ==========================================================================
   نظام إضافة المنتجات الذكي والمباشر لشذى (In-Page Product Wizard)
   يتيح للمستخدم رفع الصور وإدخال الأسعار والأحجام والخامات دون تعديل الكود
   ========================================================================== */

let wizardCurrentStep = 1;
let wizardImages = [];

function openAddProductModal() {
  const isOwner = isCurrentUserOwner();

  if (!isOwner) {
    showToast("عذراً، هذه اللوحة مخصصة لمالك المتجر شذى. يرجى تسجيل الدخول بحساب المالك.", "error");
    openAccountOrAuthModal();
    return;
  }

  const modal = document.getElementById("addProductModal");
  const backdrop = document.getElementById("modalBackdrop");

  // لو الـ modal غير موجود في هذه الصفحة (مثل صفحات الباكدجات)، انتقل للصفحة الرئيسية وافتحه هناك
  if (!modal) {
    showToast("جاري الانتقال للصفحة الرئيسية لفتح لوحة إضافة المنتجات...", "info");
    setTimeout(() => {
      window.location.href = "index.html#open-add-product";
    }, 600);
    return;
  }

  // إعادة ضبط وضع الإضافة
  const editInput = document.getElementById("editingProductId");
  if (editInput) editInput.value = "";

  const modalTitle = document.getElementById("wizardModalTitle");
  const modalIcon = document.getElementById("wizardModalIcon");
  const submitBtnText = document.getElementById("wizardSubmitBtnText");

  if (modalTitle) modalTitle.innerText = "نظام إضافة منتج وباقة جديدة لشذى";
  if (modalIcon) modalIcon.className = "fas fa-plus-circle";
  if (submitBtnText) submitBtnText.innerText = "حفظ ونشر الباقة فوراً";

  window._isAddingForWeddingBox = false;

  document.getElementById("wizardProductForm")?.reset();

  const isWeddingCb = document.getElementById("wIsWeddingProduct");
  const weddingCatGroup = document.getElementById("wWeddingCategoryGroup");
  const weddingCatSelect = document.getElementById("wWeddingCategory");
  if (isWeddingCb) isWeddingCb.checked = false;
  if (weddingCatGroup) weddingCatGroup.style.display = "none";
  if (weddingCatSelect) weddingCatSelect.value = "bridal_bouquet";

  wizardImages = [];
  renderWizardImages();
  initWizardSizes();
  switchWizardStep(1);

  backdrop?.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}


// فتح نافذة إضافة منتج جديد خصيصاً لداخل صندوق العرسان الدوار للمالك
function openAddProductModalForWeddingBox() {
  const isOwner = isCurrentUserOwner();
  if (!isOwner) {
    showToast("عذراً، إضافة منتجات لداخل الصندوق متاح فقط لمالك المتجر شذى بعد تسجيل الدخول.", "error");
    openAccountOrAuthModal();
    return;
  }

  // لو الـ modal غير موجود (مثل wedding.html)، انتقل للصفحة الرئيسية مع hash خاص بالصندوق
  if (!document.getElementById("addProductModal")) {
    showToast("جاري الانتقال للصفحة الرئيسية لفتح لوحة إضافة منتج الصندوق...", "info");
    setTimeout(() => { window.location.href = "index.html#open-add-wedding-box"; }, 600);
    return;
  }

  openAddProductModal();
  window._isAddingForWeddingBox = true;

  const modalTitle = document.getElementById("wizardModalTitle");
  if (modalTitle) modalTitle.innerText = "إضافة منتج جديد لداخل صندوق العرسان الملكي 🎁💍";
  
  const submitBtnText = document.getElementById("wizardSubmitBtnText");
  if (submitBtnText) submitBtnText.innerText = "إضافة ونشر المنتج داخل الصندوق فوراً 🌸";

  const isWeddingCb = document.getElementById("wIsWeddingProduct");
  const weddingCatGroup = document.getElementById("wWeddingCategoryGroup");
  const weddingCatSelect = document.getElementById("wWeddingCategory");
  if (isWeddingCb) isWeddingCb.checked = true;
  if (weddingCatGroup) weddingCatGroup.style.display = "block";
  if (weddingCatSelect) weddingCatSelect.value = "bridal_bouquet";

  const tagInput = document.getElementById("wTag");
  if (tagInput) tagInput.value = "محتويات صندوق العرسان 🎁";
}

// فتح نافذة إضافة منتج جديد لقسم العرسان العام
function openAddProductModalForWedding(defaultDept) {
  const isOwner = isCurrentUserOwner();
  if (!isOwner) {
    showToast("عذراً، إضافة المنتجات متاحة فقط لمالك المتجر شذى.", "error");
    openAccountOrAuthModal();
    return;
  }

  // لو الـ modal غير موجود، انتقل للصفحة الرئيسية
  if (!document.getElementById("addProductModal")) {
    showToast("جاري الانتقال للصفحة الرئيسية لفتح لوحة الإضافة...", "info");
    setTimeout(() => { window.location.href = "index.html#open-add-product"; }, 600);
    return;
  }

  openAddProductModal();
  window._isAddingForWeddingBox = false;
  const isWeddingCb = document.getElementById("wIsWeddingProduct");
  const weddingCatGroup = document.getElementById("wWeddingCategoryGroup");
  const weddingCatSelect = document.getElementById("wWeddingCategory");
  if (isWeddingCb) isWeddingCb.checked = true;
  if (weddingCatGroup) weddingCatGroup.style.display = "block";

  const targetDept = (defaultDept && defaultDept !== 'all') 
    ? defaultDept 
    : (appState.activeWeddingDept !== 'all' ? appState.activeWeddingDept : 'bridal_bouquet');
  if (weddingCatSelect) weddingCatSelect.value = targetDept;
}


// فتح نافذة تعديل باقة قائمة للمالك
function openEditProductModal(productId) {
  const isOwner = isCurrentUserOwner();

  if (!isOwner) {
    showToast("عذراً، التعديل متاح فقط لمالك المتجر شذى بعد تسجيل الدخول.", "error");
    openAccountOrAuthModal();
    return;
  }

  const product = appState.products.find(p => p.id === productId);
  if (!product) {
    showToast("لم يتم العثور على الباقة المطلوبة", "error");
    return;
  }

  const modal = document.getElementById("addProductModal");
  const backdrop = document.getElementById("modalBackdrop");

  // لو الـ modal غير موجود في هذه الصفحة، انتقل للصفحة الرئيسية لفتح التعديل هناك
  if (!modal) {
    showToast("جاري الانتقال للصفحة الرئيسية لتعديل المنتج...", "info");
    setTimeout(() => {
      window.location.href = `index.html#edit-product-${productId}`;
    }, 600);
    return;
  }


  // وضع معرّف المنتج قيد التعديل
  const editInput = document.getElementById("editingProductId");
  if (editInput) editInput.value = product.id;

  // تحديث النصوص والعناوين
  const modalTitle = document.getElementById("wizardModalTitle");
  const modalIcon = document.getElementById("wizardModalIcon");
  const submitBtnText = document.getElementById("wizardSubmitBtnText");

  if (modalTitle) modalTitle.innerText = `تعديل باقة: ${product.name}`;
  if (modalIcon) modalIcon.className = "fas fa-edit";
  if (submitBtnText) submitBtnText.innerText = "حفظ التعديلات على الباقة";

  // تعبئة بيانات الخطوة 1
  if (document.getElementById("wName")) document.getElementById("wName").value = product.name || "";
  if (document.getElementById("wBasePrice")) document.getElementById("wBasePrice").value = product.basePrice || "";
  if (document.getElementById("wPrice")) document.getElementById("wPrice").value = product.basePrice || "";
  if (document.getElementById("wOldPrice")) document.getElementById("wOldPrice").value = product.oldPrice || "";
  if (document.getElementById("wTag")) document.getElementById("wTag").value = product.tag || "";
  if (document.getElementById("wShortDesc")) document.getElementById("wShortDesc").value = product.shortDesc || "";

  // تعبئة بيانات باكدج العرسان
  const isWeddingCb = document.getElementById("wIsWeddingProduct");
  const weddingCatGroup = document.getElementById("wWeddingCategoryGroup");
  const weddingCatSelect = document.getElementById("wWeddingCategory");
  const isWedding = !!(product.isWedding || product.weddingCategory);
  if (isWeddingCb) isWeddingCb.checked = isWedding;
  if (weddingCatGroup) weddingCatGroup.style.display = isWedding ? "block" : "none";
  if (weddingCatSelect && product.weddingCategory) weddingCatSelect.value = product.weddingCategory;

  // تعبئة بيانات الخطوة 2: الصور
  wizardImages = Array.isArray(product.images) ? [...product.images] : [];
  renderWizardImages();

  // تعبئة بيانات الخطوة 3: المقاسات
  const container = document.getElementById("wSizesContainer") || document.getElementById("wizardSizesContainer");
  if (container) {
    if (Array.isArray(product.sizes) && product.sizes.length > 0) {
      container.innerHTML = product.sizes.map(s => `
        <div class="wizard-size-row" style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 35px; gap: 8px; background: #fff; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); align-items: center;">
          <input type="text" class="form-control wz-size-name" style="font-size: 0.85rem; padding: 8px;" placeholder="اسم المقاس" value="${s.name || ''}">
          <input type="number" class="form-control wz-size-price" style="font-size: 0.85rem; padding: 8px;" placeholder="السعر" value="${s.price || ''}">
          <input type="text" class="form-control wz-size-stems" style="font-size: 0.85rem; padding: 8px;" placeholder="التنسيق" value="${s.stems || ''}">
          <button type="button" onclick="this.closest('.wizard-size-row').remove()" style="color: #E74C3C; font-size: 0.9rem;" title="حذف المقاس"><i class="fas fa-trash"></i></button>
        </div>
      `).join('');
    } else {
      initWizardSizes();
    }
  }

  // تعبئة بيانات الخطوة 4: الخامات والميزات
  if (document.getElementById("wMaterials")) document.getElementById("wMaterials").value = product.materials || "";
  if (document.getElementById("wCraft")) document.getElementById("wCraft").value = product.craftsmanship || "";
  if (document.getElementById("wCraftsmanship")) document.getElementById("wCraftsmanship").value = product.craftsmanship || "";
  if (document.getElementById("wAdvantages")) {
    document.getElementById("wAdvantages").value = Array.isArray(product.advantages) ? product.advantages.join('\n') : "";
  }

  switchWizardStep(1);

  backdrop?.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

// حذف باقة أو منتج نهائياً بواسطة المالك
function deleteProductById(productId) {
  const isOwner = isCurrentUserOwner();

  if (!isOwner) {
    showToast("عذراً، صلاحية الحذف متاحة فقط لمالك المتجر بعد تسجيل الدخول.", "error");
    openAccountOrAuthModal();
    return;
  }

  const product = (appState.products || []).find(p => p.id === productId) || (typeof SHATHA_PRODUCTS !== 'undefined' ? SHATHA_PRODUCTS.find(p => p.id === productId) : null);
  const prodName = product ? product.name : "هذا المنتج";

  const confirmed = confirm(`هل أنت متأكد من رغبتك في حذف "${prodName}" نهائياً من المتجر والصندوق؟`);
  if (!confirmed) return;

  appState.products = (appState.products || []).filter(p => p.id !== productId);
  
  try {
    const saved = localStorage.getItem('shatha_wedding_box_ids');
    if (saved) {
      let boxIds = JSON.parse(saved);
      boxIds = boxIds.filter(id => id !== productId);
      localStorage.setItem('shatha_wedding_box_ids', JSON.stringify(boxIds));
      SHATHA_CLOUD.set('wedding_box_ids', boxIds);
    }
  } catch(e) {}

  saveAllProductsToStorage();

  closeProductModal();
  renderProducts();
  renderWeddingSection();
  if (typeof renderWeddingBoxCards === 'function') renderWeddingBoxCards();

  showToast(`تم حذف "${prodName}" بنجاح 🗑️`, "info");
}

function closeAddProductModal() {
  const modal = document.getElementById("addProductModal");
  const backdrop = document.getElementById("modalBackdrop");
  modal?.classList.remove("active");
  backdrop?.classList.remove("active");
  document.body.style.overflow = "auto";
}

function switchWizardStep(step) {
  if (step === 2) {
    const name = document.getElementById("wName")?.value.trim();
    const price = document.getElementById("wBasePrice")?.value || document.getElementById("wPrice")?.value;
    const desc = document.getElementById("wShortDesc")?.value.trim();
    if (!name || !price || !desc) {
      showToast("يرجى ملء اسم المنتج وسعره والوصف أولاً للمتابعة", "error");
      return;
    }
  }

  if (step === 3 && wizardImages.length === 0) {
    showToast("يرجى اختيار صورة واحدة على الأقل للباقة للمتابعة", "error");
    return;
  }

  wizardCurrentStep = step;

  for (let i = 1; i <= 4; i++) {
    const content = document.getElementById(`wizardStep${i}`);
    const tab = document.getElementById(`wizardTab${i}`);
    if (content) content.style.display = (i === step) ? "block" : "none";
    if (tab) {
      tab.style.background = (i === step) ? "var(--primary-soft)" : "transparent";
      tab.style.color = (i === step) ? "var(--primary-dark)" : "var(--text-muted)";
      const badge = tab.querySelector("span");
      if (badge) {
        badge.style.background = (i === step) ? "var(--primary-pink)" : "var(--border-subtle)";
        badge.style.color = (i === step) ? "#FFFFFF" : "var(--text-main)";
      }
    }
  }
}

// ضغط الصورة قبل تحويلها إلى Base64 لتخفيف الحجم وسرعة الرفع (Canvas API)
function compressImageToBase64(file, maxWidth = 640, quality = 0.65) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // fallback: اقرأ الصورة كما هي
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

// قراءة ملفات الصور المختارة من الجهاز (مع ضغط تلقائي)
function handleWizardFiles(files) {
  if (!files || files.length === 0) return;

  Array.from(files).forEach(async (file) => {
    if (!file.type.startsWith('image/')) return;
    try {
      const compressed = await compressImageToBase64(file);
      wizardImages.push(compressed);
      renderWizardImages();
    } catch (e) {
      // fallback لو الضغط فشل
      const reader = new FileReader();
      reader.onload = (ev) => {
        wizardImages.push(ev.target.result);
        renderWizardImages();
      };
      reader.readAsDataURL(file);
    }
  });
}


// إضافة مسار يدوي من مجلد FLOURS
function addWizardManualPath() {
  const input = document.getElementById("wManualPath");
  const path = input?.value.trim();
  if (!path) {
    showToast("يرجى كتابة مسار الصورة أولاً", "error");
    return;
  }
  wizardImages.push(path);
  input.value = "";
  renderWizardImages();
  showToast("تمت إضافة مسار الصورة بنجاح!", "success");
}

function renderWizardImages() {
  const grid = document.getElementById("wImagesGrid");
  const counter = document.getElementById("wImagesCount");
  if (counter) counter.innerText = wizardImages.length;
  if (!grid) return;

  if (wizardImages.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 15px;">لم تقم باختيار أي صورة بعد</div>`;
    return;
  }

  grid.innerHTML = wizardImages.map((src, idx) => `
    <div style="position: relative; aspect-ratio: 1/1; border-radius: var(--radius-sm); overflow: hidden; border: 1.5px solid var(--border-subtle); box-shadow: var(--shadow-sm);">
      <img src="${src}" alt="صورة ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
      <button type="button" onclick="removeWizardImage(${idx})" style="position: absolute; top: 3px; left: 3px; background: rgba(231,76,60,0.85); color: #fff; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;" title="حذف الصورة">
        <i class="fas fa-times"></i>
      </button>
      <span style="position: absolute; bottom: 0; right: 0; left: 0; background: rgba(0,0,0,0.6); color: #fff; font-size: 0.65rem; text-align: center; padding: 2px 0;">
        ${idx === 0 ? 'الرئيسية' : 'زاوية ' + (idx + 1)}
      </span>
    </div>
  `).join('');
}

function removeWizardImage(index) {
  wizardImages.splice(index, 1);
  renderWizardImages();
}

// الأحجام الافتراضية
function initWizardSizes() {
  const container = document.getElementById("wSizesContainer");
  if (!container) return;

  const basePrice = document.getElementById("wBasePrice")?.value || 450;
  container.innerHTML = `
    <div class="wizard-size-row" style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 35px; gap: 8px; background: #fff; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); align-items: center;">
      <input type="text" class="form-control wz-size-name" style="font-size: 0.85rem; padding: 8px;" placeholder="اسم المقاس" value="باقة كلاسيكية (15-18 زهرة)">
      <input type="number" class="form-control wz-size-price" style="font-size: 0.85rem; padding: 8px;" placeholder="السعر" value="${basePrice}">
      <input type="text" class="form-control wz-size-stems" style="font-size: 0.85rem; padding: 8px;" placeholder="التنسيق" value="15-18 زهرة ستان هاندميد">
      <button type="button" onclick="this.closest('.wizard-size-row').remove()" style="color: #E74C3C; font-size: 0.9rem;" title="حذف المقاس"><i class="fas fa-trash"></i></button>
    </div>
    <div class="wizard-size-row" style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 35px; gap: 8px; background: #fff; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); align-items: center;">
      <input type="text" class="form-control wz-size-name" style="font-size: 0.85rem; padding: 8px;" placeholder="اسم المقاس" value="باقة ديلوكس (25-30 زهرة)">
      <input type="number" class="form-control wz-size-price" style="font-size: 0.85rem; padding: 8px;" placeholder="السعر" value="${Math.round(basePrice * 1.35)}">
      <input type="text" class="form-control wz-size-stems" style="font-size: 0.85rem; padding: 8px;" placeholder="التنسيق" value="25-30 زهرة ستان هاندميد">
      <button type="button" onclick="this.closest('.wizard-size-row').remove()" style="color: #E74C3C; font-size: 0.9rem;" title="حذف المقاس"><i class="fas fa-trash"></i></button>
    </div>
  `;
}

function addWizardSizeRow() {
  const container = document.getElementById("wSizesContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "wizard-size-row";
  row.style = "display: grid; grid-template-columns: 1.5fr 1fr 1fr 35px; gap: 8px; background: #fff; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); align-items: center;";
  row.innerHTML = `
    <input type="text" class="form-control wz-size-name" style="font-size: 0.85rem; padding: 8px;" placeholder="اسم المقاس" value="باقة ملكية ضخمة">
    <input type="number" class="form-control wz-size-price" style="font-size: 0.85rem; padding: 8px;" placeholder="السعر" value="">
    <input type="text" class="form-control wz-size-stems" style="font-size: 0.85rem; padding: 8px;" placeholder="التنسيق" value="تنسيق خاص VIP">
    <button type="button" onclick="this.closest('.wizard-size-row').remove()" style="color: #E74C3C; font-size: 0.9rem;" title="حذف المقاس"><i class="fas fa-trash"></i></button>
  `;
  container.appendChild(row);
}

// حفظ ونشر المنتج وإدراجه فوراً في المتجر والسحابة
function handleWizardProductSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  // التحقق من صلاحية المالك قبل الحفظ
  if (!isCurrentUserOwner()) {
    showToast("عذراً، حفظ ونشر الباقات متاح فقط لمالك المتجر شذى.", "error");
    return;
  }

  const name = document.getElementById("wName")?.value.trim();
  const basePriceInput = document.getElementById("wBasePrice")?.value || document.getElementById("wPrice")?.value;
  const basePrice = parseFloat(basePriceInput);
  const shortDesc = document.getElementById("wShortDesc")?.value.trim();

  // التحقق من الحقول الأساسية أولاً
  if (!name) {
    switchWizardStep(1);
    showToast("يرجى كتابة اسم الباقة في الخطوة 1", "error");
    document.getElementById("wName")?.focus();
    return;
  }

  if (!basePrice || isNaN(basePrice) || basePrice <= 0) {
    switchWizardStep(1);
    showToast("يرجى كتابة سعر صحيح للباقة في الخطوة 1", "error");
    (document.getElementById("wBasePrice") || document.getElementById("wPrice"))?.focus();
    return;
  }

  if (!shortDesc) {
    switchWizardStep(1);
    showToast("يرجى كتابة وصف ومكونات الباقة في الخطوة 1", "error");
    document.getElementById("wShortDesc")?.focus();
    return;
  }

  if (!wizardImages || wizardImages.length === 0) {
    switchWizardStep(2);
    showToast("يرجى اختيار صورة واحدة على الأقل في الخطوة 2", "error");
    return;
  }

  const isWeddingBox = !!window._isAddingForWeddingBox;
  const isWedding = (document.getElementById("wIsWeddingProduct")?.checked || false) || isWeddingBox;
  const weddingCategory = isWedding ? (document.getElementById("wWeddingCategory")?.value || "bridal_bouquet") : null;
  const oldPrice = parseFloat(document.getElementById("wOldPrice")?.value) || null;
  const tag = document.getElementById("wTag")?.value.trim() || (isWeddingBox ? "محتويات صندوق العرسان 🎁" : (isWedding ? "تجهيزات الفرح الملكية" : "شغل يدوي فاخر"));
  const materials = document.getElementById("wMaterials")?.value.trim() || "أشرطة ستان حريري تركي فاخر عالي اللمعان، تغليف كوري سموكي أسود أنيق مقاوم للماء.";
  const craftsmanship = document.getElementById("wCraft")?.value.trim() || document.getElementById("wCraftsmanship")?.value.trim() || "صناعة يدوية متقنة 100% - طي وتشكيل بتلات الجوري بحرفية لتدوم للأبد دون أن تذبل.";

  const advText = document.getElementById("wAdvantages")?.value.trim();
  const advantages = advText ? advText.split('\n').map(l => l.trim()).filter(l => l.length > 0) : [
    "ورد ستان مصنوع يدوياً يدوم مدى الحياة ولا يذبل أبداً.",
    "لا يحتاج إلى ماء أو شمس أو أي عناية خاصة.",
    "كارت إهداء مطبوع مجاناً مع كل باقة."
  ];

  const sizeRows = document.querySelectorAll(".wizard-size-row");
  const sizes = [];
  sizeRows.forEach((row, i) => {
    const sName = row.querySelector(".wz-size-name")?.value.trim() || `مقاس ${i + 1}`;
    const sPrice = parseFloat(row.querySelector(".wz-size-price")?.value) || basePrice;
    const sStems = row.querySelector(".wz-size-stems")?.value.trim() || "تنسيق خاص";
    sizes.push({
      id: `wz_size_${i}_${Date.now()}`,
      name: sName,
      price: sPrice,
      stems: sStems,
      sizeLabel: "مقاس قياسي",
      desc: "صناعة يدوية متقنة بتنسيق شذى"
    });
  });

  if (sizes.length === 0) {
    sizes.push({
      id: `wz_size_default_${Date.now()}`,
      name: "باقة قياسية",
      price: basePrice,
      stems: "تنسيق يدوي",
      sizeLabel: "قياسي",
      desc: "صناعة يدوية متقنة بتنسيق شذى"
    });
  }

  const editingId = document.getElementById("editingProductId")?.value;

  if (editingId) {
    try {
      const prodIndex = appState.products.findIndex(p => p.id === editingId);
      if (prodIndex > -1) {
        const existing = appState.products[prodIndex];
        existing.name = name;
        existing.basePrice = basePrice;
        existing.oldPrice = oldPrice;
        existing.tag = tag;
        existing.shortDesc = shortDesc;
        existing.images = [...wizardImages];
        existing.materials = materials;
        existing.craftsmanship = craftsmanship;
        existing.sizes = sizes;
        existing.advantages = advantages;
        existing.isWedding = isWedding;
        if (isWeddingBox) existing.isWeddingBox = true;
        existing.weddingCategory = weddingCategory;

        renderProducts();
        renderWeddingSection();
        if (typeof renderWeddingBoxCards === 'function') renderWeddingBoxCards();

        if (document.getElementById("productDetailsModal")?.classList.contains("active") && appState.selectedProduct?.id === editingId) {
          openProductModal(editingId);
        }

        closeAddProductModal();
        showToast(`🎉 تم حفظ تعديلات منتج "${existing.name}" بنجاح!`, "success");

        saveAllProductsToStorage();
        return;
      }
    } catch (err) {
      console.error(err);
      showToast("حدث خطأ أثناء حفظ تعديلات الباقة", "error");
      return;
    }
  }

  const newProduct = {
    id: "custom_" + Date.now(),
    name: name,
    slug: "shatha-custom-" + Date.now(),
    tag: tag,
    isBestSeller: true,
    isWedding: isWedding,
    isWeddingBox: isWeddingBox,
    weddingCategory: weddingCategory,
    // حفظ القسم المختار أو الحالي لكي يظهر المنتج في صفحته الصحيحة تلقائياً
    category: (document.getElementById("wMainDepartment")?.value && document.getElementById("wMainDepartment")?.value !== 'auto') 
      ? document.getElementById("wMainDepartment").value 
      : ((window.SHATHA_CURRENT_DEPT || '').toLowerCase().trim() || (isWedding ? 'wedding' : 'general')),
    dept: (document.getElementById("wMainDepartment")?.value && document.getElementById("wMainDepartment")?.value !== 'auto') 
      ? document.getElementById("wMainDepartment").value 
      : ((window.SHATHA_CURRENT_DEPT || '').toLowerCase().trim() || (isWedding ? 'wedding' : 'general')),
    basePrice: basePrice,
    oldPrice: oldPrice,
    rating: 5.0,
    reviewsCount: 1,
    stock: "متوفر حسب الطلب (صناعة يدوية خاصة)",
    inStock: true,
    shortDesc: shortDesc,
    images: [...wizardImages],
    materials: materials,
    craftsmanship: craftsmanship,
    sizes: sizes,
    advantages: advantages,
    reviews: [
      { author: "عميل شذى", rating: 5, date: "الآن", comment: "منتج رائع ومتقن للغاية!" }
    ],
    isCustom: true
  };

  // تحديث قائمة فلتر الصفحة الحالية لتشمل المنتج الجديد فوراً
  if (Array.isArray(window.SHATHA_CATEGORY_FILTER) && newProduct.id) {
    window.SHATHA_CATEGORY_FILTER.push(newProduct.id);
  }

  try {
    appState.products.unshift(newProduct);

    if (isWeddingBox) {
      try {
        let boxIds = [
          "shatha-wedding-ivory-bridal",
          "shatha-wedding-frame-glass",
          "shatha-wedding-bridal-necklace",
          "shatha-wedding-fingerprint-tree"
        ];
        const saved = localStorage.getItem('shatha_wedding_box_ids');
        if (saved) {
          try { boxIds = JSON.parse(saved); } catch(e){}
        }
        if (!boxIds.includes(newProduct.id)) {
          boxIds.push(newProduct.id);
          localStorage.setItem('shatha_wedding_box_ids', JSON.stringify(boxIds));
          SHATHA_CLOUD.set('wedding_box_ids', boxIds);
        }
      } catch(e) {}
      window._isAddingForWeddingBox = false;
    }

    renderProducts();
    renderWeddingSection();
    if (typeof renderWeddingBoxCards === 'function') renderWeddingBoxCards();
    closeAddProductModal();
    
    if (isWeddingBox) {
      showToast(`🎉 ألف مبروك! تم إضافة منتج "${newProduct.name}" لداخل صندوق العرسان الدوار بنجاح! 🎁`, "success");
      if (document.getElementById("weddingBoxStage")) {
        document.getElementById("weddingBoxStage")?.scrollIntoView({ behavior: "smooth" });
        if (typeof openWeddingBoxInteractive === 'function' && !weddingBoxState.isOpen) {
          openWeddingBoxInteractive();
        }
      }
    } else {
      showToast(`🎉 تم نشر منتج "${newProduct.name}" بنجاح وتظهر الآن في المتجر!`, "success");
      if (isWedding) {
        if (document.getElementById("weddingProductsGrid")) {
          document.getElementById("weddingProductsGrid")?.scrollIntoView({ behavior: "smooth" });
        } else {
          document.getElementById("wedding")?.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
      }
    }

    saveAllProductsToStorage();
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء نشر الباقة", "error");
  }
}

/* ==========================================================================
   إدارة تطبيق الهاتف وتثبيت الـ PWA (Install Mobile Web App)
   ========================================================================== */
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // منع المتصفح من إظهار النافذة الافتراضية القديمة
  e.preventDefault();
  deferredPrompt = e;

  // إظهار شريط تثبيت تطبيق شذى الأنيق
  const banner = document.getElementById("pwaInstallBanner");
  if (banner && !sessionStorage.getItem('shatha_pwa_dismissed')) {
    banner.style.display = "flex";
  }
});

document.getElementById("btnPwaInstall")?.addEventListener("click", async () => {
  const banner = document.getElementById("pwaInstallBanner");
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast("شكراً لك! تم تثبيت تطبيق شذى على شاشة هاتفك بنجاح 🌸", "success");
    }
    deferredPrompt = null;
    if (banner) banner.style.display = "none";
  } else {
    // لهواتف آيفون (iOS Safari)
    showToast("لتثبيت التطبيق على الآيفون: اضغط على زر المشاركة (Share) بالأسفل ثم اختر 'إضافة إلى الشاشة الرئيسية (Add to Home Screen)'", "info");
  }
});

document.getElementById("btnPwaDismiss")?.addEventListener("click", () => {
  const banner = document.getElementById("pwaInstallBanner");
  if (banner) banner.style.display = "none";
  sessionStorage.setItem('shatha_pwa_dismissed', 'true');
});

// تسجيل الـ Service Worker لتمكين عمل الموقع كتطبيق موبايل
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      // صامت في بيئة التطوير المحلية
      console.log('SW registration note:', err);
    });
  });
}

/* ==========================================================================
   إدارة الوضع الليلي والفاتح (Dark / Light Mode)
   متجر شَـذى - أيقونة تفاعلية متناسقة مع ألوان وهوية الموقع
   ========================================================================== */
const SHATHA_THEME_KEY = 'shatha_theme';

function getShathaTheme() {
  try {
    const saved = localStorage.getItem(SHATHA_THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (e) {}
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function updateThemeUI(theme) {
  const isDark = theme === 'dark';
  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  
  toggleBtns.forEach(btn => {
    const title = isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الليلي';
    btn.setAttribute('aria-label', title);
    btn.setAttribute('title', title);
    
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
      icon.classList.remove('theme-icon-rotate');
      void icon.offsetWidth; // إعادة تشغيل الأنيميشن
      icon.classList.add('theme-icon-rotate');
    }
  });

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#140E10' : '#BF7279');
  }
}

function applyShathaTheme(theme, animate = false, notify = false) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-transitioning');
    window.clearTimeout(window.__themeTimeout);
    window.__themeTimeout = setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 450);
  }

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }

  updateThemeUI(theme);

  if (notify && typeof showToast === 'function') {
    if (theme === 'dark') {
      showToast('تم تفعيل الوضع الليلي الفاخر 🌙', 'info');
    } else {
      showToast('تم تفعيل الوضع الفاتح الأنيق ☀️', 'info');
    }
  }
}

window.toggleTheme = function () {
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(SHATHA_THEME_KEY, newTheme);
  } catch (e) {}
  
  applyShathaTheme(newTheme, true, true);

  if (navigator.vibrate) {
    try { navigator.vibrate(25); } catch (e) {}
  }
};

// تهيئة فورية عند تحميل المستند
(function initTheme() {
  const activeTheme = getShathaTheme();
  applyShathaTheme(activeTheme, false, false);

  document.addEventListener('DOMContentLoaded', () => {
    updateThemeUI(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        window.toggleTheme();
      };
    });
  });

  // الاستماع لتغيير وضع النظام في حال لم يحدد المستخدم يدوياً
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      try {
        if (!localStorage.getItem(SHATHA_THEME_KEY)) {
          applyShathaTheme(e.matches ? 'dark' : 'light', true, false);
        }
      } catch (err) {}
    });
  }
})();

/* ==========================================================================
   إدارة باكدج العرسان الملكي (Wedding Package System)
   "كل حاجة محتاجاها في فرحك في مكان واحد"
   ========================================================================== */

// تبديل إظهار قائمة أقسام الفرح في لوحة إضافة المنتج للمالك
function toggleWeddingCategoryGroup(isChecked) {
  const group = document.getElementById("wWeddingCategoryGroup");
  if (group) group.style.display = isChecked ? "block" : "none";
}

// فتح لوحة إضافة منتج مخصصة مباشرة لقسم العرسان
function openAddProductModalForWedding(defaultDept) {
  openAddProductModal();
  const isWeddingCb = document.getElementById("wIsWeddingProduct");
  const weddingCatGroup = document.getElementById("wWeddingCategoryGroup");
  const weddingCatSelect = document.getElementById("wWeddingCategory");

  if (isWeddingCb) isWeddingCb.checked = true;
  if (weddingCatGroup) weddingCatGroup.style.display = "block";

  const targetDept = (defaultDept && defaultDept !== 'all') 
    ? defaultDept 
    : (appState.activeWeddingDept !== 'all' ? appState.activeWeddingDept : 'bridal_bouquet');

  if (weddingCatSelect) weddingCatSelect.value = targetDept;
}

// ثيمات أقسام ومنتجات ليلة العمر الملكية (Dynamic Color Themes) - ألوان مشبعة وواضحة جداً
const WEDDING_THEMES = {
  all: {
    name: "ثيم ليلة العمر: كل مستلزمات الفرح الملكية ✨",
    color: "#D81B60",
    glow: "rgba(216, 27, 96, 0.4)",
    bodyBg: "#FDF2F4",
    themeKey: "all"
  },
  bridal_bouquet: {
    name: "ثيم بوكيهات العروسة: وردي رومانسي زاهي ولؤلؤ 💐",
    color: "#D81B60",
    glow: "rgba(216, 27, 96, 0.45)",
    bodyBg: "#FFDDE4",
    themeKey: "bridal_bouquet"
  },
  katb_ketab: {
    name: "ثيم كتب الكتاب: زمردي أخضر ملكي ساطع 📜",
    color: "#059669",
    glow: "rgba(5, 150, 105, 0.45)",
    bodyBg: "#D1F2DF",
    themeKey: "katb_ketab"
  },
  frames: {
    name: "ثيم البراويز التذكارية: ذهبي كهرماني مشمس فخم 🖼️",
    color: "#D97706",
    glow: "rgba(217, 119, 6, 0.45)",
    bodyBg: "#FDE68A",
    themeKey: "frames"
  },
  mandil_fingerprint: {
    name: "ثيم المنديل والبصمة: بنفسجي وموف حريري ملكي بارز 🕊️",
    color: "#7C3AED",
    glow: "rgba(124, 58, 237, 0.45)",
    bodyBg: "#DDD6FE",
    themeKey: "mandil_fingerprint"
  },
  crowns: {
    name: "ثيم الأطواق والتيجان: سماوي كريستال بحري منعش 👑",
    color: "#0284C7",
    glow: "rgba(2, 132, 199, 0.45)",
    bodyBg: "#BAE6FD",
    themeKey: "crowns"
  },
  favors: {
    name: "ثيم هدايا المعازيم: بوردو عنابي دافئ ومخملي قوي 🎁",
    color: "#E11D48",
    glow: "rgba(225, 29, 72, 0.45)",
    bodyBg: "#FECDD3",
    themeKey: "favors"
  }
};

// تخصيص لوني متفرد وواضح لكل منتج من منتجات الفرح
const WEDDING_PRODUCT_THEMES = {
  "shatha-bridal-royal-bouquet": {
    name: "لون البوكيه الملكي: وردي رومانسي زاهي وأوف وايت 🌸",
    color: "#D81B60",
    glow: "rgba(216, 27, 96, 0.5)",
    bodyBg: "#FFDDE4",
    themeKey: "bridal_bouquet"
  },
  "shatha-wedding-katb-ketab-set": {
    name: "لون طقم كتب الكتاب: زمردي أخضر ملكي وذهب عتيق 📜",
    color: "#059669",
    glow: "rgba(5, 150, 105, 0.5)",
    bodyBg: "#D1F2DF",
    themeKey: "katb_ketab"
  },
  "shatha-wedding-mini-hand-bouquet": {
    name: "لون ميني بوكيه العروسة: مشمشي خوخي دافئ وعاجي 🍑",
    color: "#EA580C",
    glow: "rgba(234, 88, 12, 0.5)",
    bodyBg: "#FED7AA",
    themeKey: "pink"
  },
  "shatha-wedding-frame-glass": {
    name: "لون برواز عقد القران: شامبين وذهبي براق مشمس 🖼️",
    color: "#D97706",
    glow: "rgba(217, 119, 6, 0.5)",
    bodyBg: "#FDE68A",
    themeKey: "frames"
  },
  "shatha-wedding-frame-memory-3d": {
    name: "لون برواز الذاكرة 3D: كهرماني مخملي دافئ 🏺",
    color: "#B45309",
    glow: "rgba(180, 83, 9, 0.5)",
    bodyBg: "#FCD34D",
    themeKey: "gold"
  },
  "shatha-wedding-mandil-luxury": {
    name: "لون المنديل الحريري: موف ملكي وبنفسجي حرير غني 🕊️",
    color: "#7C3AED",
    glow: "rgba(124, 58, 237, 0.5)",
    bodyBg: "#DDD6FE",
    themeKey: "mandil_fingerprint"
  },
  "shatha-wedding-fingerprint-tree": {
    name: "لون لوحة البصمة: لافندر وأرجواني باستيل بارز 🎨",
    color: "#9333EA",
    glow: "rgba(147, 51, 234, 0.5)",
    bodyBg: "#E9D5FF",
    themeKey: "purple"
  },
  "shatha-wedding-bridal-crown": {
    name: "لون تاج العروسة: سماوي كريستال وبحري ملكي 👑",
    color: "#0284C7",
    glow: "rgba(2, 132, 199, 0.5)",
    bodyBg: "#BAE6FD",
    themeKey: "crowns"
  },
  "shatha-wedding-favors-box": {
    name: "لون بوكس التوزيعات: عنابي بوردو مخملي صريح 🎁",
    color: "#E11D48",
    glow: "rgba(225, 29, 72, 0.5)",
    bodyBg: "#FECDD3",
    themeKey: "favors"
  }
};

// تطبيق تغيير لون صفحة الباكدج ديناميكياً بألوان واضحة جداً
function applyWeddingPageTheme(themeKey, customName, customColor, customGlow, customBodyBg) {
  const section = document.querySelector(".wedding-package-section");
  if (!section) return;

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const themeData = WEDDING_THEMES[themeKey] || WEDDING_THEMES.all;

  section.setAttribute("data-wedding-theme", themeKey);
  const color = customColor || themeData.color;
  const glow = customGlow || themeData.glow;
  const label = customName || themeData.name;
  const bodyBg = customBodyBg || themeData.bodyBg;

  section.style.setProperty("--wedding-theme-accent", color);
  section.style.setProperty("--wedding-theme-glow", glow);

  if (!isDark && bodyBg) {
    document.body.style.backgroundColor = bodyBg;
    document.body.style.transition = "background-color 0.5s ease";
  } else if (isDark) {
    document.body.style.backgroundColor = "";
  }

  // تحديث المؤشر اللوني التفاعلي في ترويسة الصفحة
  const indicator = document.getElementById("weddingActiveThemeIndicator");
  const dot = document.getElementById("weddingThemeDot");
  const labelEl = document.getElementById("weddingThemeLabel");

  if (dot) {
    dot.style.background = color;
    dot.style.boxShadow = `0 0 14px ${color}`;
  }
  if (labelEl) {
    labelEl.innerHTML = `<strong>${label}</strong>`;
  }
  if (indicator) {
    indicator.style.borderColor = color;
    indicator.style.color = isDark ? "#FFFFFF" : color;
    indicator.style.boxShadow = `0 8px 24px ${glow}`;
  }
}

// التفاعل عند تحريك الماوس أو اللمس على أي كارت منتج
function handleWeddingProductHover(productId) {
  const prod = appState.products.find(p => p.id === productId);
  if (!prod) return;

  const pt = WEDDING_PRODUCT_THEMES[productId];
  const themeKey = pt ? pt.themeKey : (prod.weddingCategory || 'all');
  const customName = pt ? pt.name : `لون المنتج: ${prod.name}`;
  const customColor = pt ? pt.color : (WEDDING_THEMES[prod.weddingCategory]?.color || '#D81B60');
  const customGlow = pt ? pt.glow : 'rgba(216, 27, 96, 0.45)';
  const customBodyBg = pt ? pt.bodyBg : (WEDDING_THEMES[prod.weddingCategory]?.bodyBg || '#FFDDE4');

  applyWeddingPageTheme(themeKey, customName, customColor, customGlow, customBodyBg);

  document.querySelectorAll(".wedding-product-card").forEach(c => {
    c.classList.toggle("active-theme-card", c.getAttribute("data-id") === productId);
  });
}

function handleWeddingProductSelect(productId) {
  handleWeddingProductHover(productId);
}

// تصفية قسم العرسان حسب التبويب المختار
function filterWeddingDept(deptId) {
  appState.activeWeddingDept = deptId || "all";
  document.querySelectorAll(".wedding-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-dept") === appState.activeWeddingDept);
  });
  applyWeddingPageTheme(appState.activeWeddingDept);
  renderWeddingSection();
}

// رسم وعرض منتجات باكدج العرسان وتحديث العدادات
function renderWeddingSection() {
  const grid = document.getElementById("weddingProductsGrid");
  if (!grid) return;

  // إعادة ضبط اللون للثيم النشط عند خروج الماوس من شبكة المنتجات
  grid.onmouseleave = () => {
    applyWeddingPageTheme(appState.activeWeddingDept || 'all');
    document.querySelectorAll(".wedding-product-card").forEach(c => c.classList.remove("active-theme-card"));
  };

  const allWeddingProds = appState.products.filter(p => p.isWedding === true || p.weddingCategory);

  // تحديث عدادات الأقسام
  const countAll = document.getElementById("count-dept-all");
  if (countAll) countAll.innerText = allWeddingProds.length;

  const deptCounts = {
    bridal_bouquet: 0,
    katb_ketab: 0,
    frames: 0,
    mandil_fingerprint: 0,
    crowns: 0,
    favors: 0
  };

  allWeddingProds.forEach(p => {
    if (p.weddingCategory && deptCounts[p.weddingCategory] !== undefined) {
      deptCounts[p.weddingCategory]++;
    }
  });

  Object.keys(deptCounts).forEach(cat => {
    const el = document.getElementById(`count-dept-${cat}`);
    if (el) el.innerText = deptCounts[cat];
  });

  // تصفية حسب القسم النشط
  let displayed = [...allWeddingProds];
  if (appState.activeWeddingDept && appState.activeWeddingDept !== "all") {
    displayed = displayed.filter(p => p.weddingCategory === appState.activeWeddingDept);
  }

  const isOwner = isCurrentUserOwner();
  const ownerAddBtn = document.getElementById("weddingOwnerAddBtn");
  if (ownerAddBtn) ownerAddBtn.style.display = isOwner ? "inline-flex" : "none";

  if (displayed.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1.5px dashed var(--border-subtle);">
        <i class="fas fa-ring" style="font-size: 2.8rem; color: var(--accent-gold); margin-bottom: 12px; opacity: 0.6;"></i>
        <h4 style="color: var(--primary-dark); margin-bottom: 6px;">لا توجد منتجات معروضة حالياً في هذا القسم</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 14px;">يمكنكِ تصفح باقي أقسام الفرح أو استشارة منسقة شذى عبر الواتساب لتجهيز طلبكِ الخاص.</p>
        ${isOwner ? `<button type="button" class="btn-primary" onclick="openAddProductModalForWedding('${appState.activeWeddingDept}')" style="background: #27AE60;"><i class="fas fa-plus"></i> إضافة منتج في هذا القسم الآن (المالك)</button>` : ''}
      </div>
    `;
    return;
  }

  const deptNames = {
    bridal_bouquet: "💐 بوكيهات العروسة",
    katb_ketab: "📜 كتب الكتاب",
    frames: "🖼️ البراويز",
    mandil_fingerprint: "🕊️ المنديل والبصمة",
    crowns: "👑 الأطواق والتيجان",
    favors: "🎁 هدايا المعازيم"
  };

  grid.innerHTML = displayed.map(product => {
    const discountPercent = product.oldPrice ? Math.round(((product.oldPrice - product.basePrice) / product.oldPrice) * 100) : null;
    const badgeText = product.tag || (product.weddingCategory ? deptNames[product.weddingCategory] : (discountPercent ? `خصم ${discountPercent}%` : "تجهيزات الفرح"));

    const pt = WEDDING_PRODUCT_THEMES[product.id];
    const productColor = pt ? pt.color : (WEDDING_THEMES[product.weddingCategory]?.color || '#BF7279');
    const productGlow = pt ? pt.glow : 'rgba(191, 114, 121, 0.4)';

    return `
      <div class="product-card wedding-card wedding-product-card" 
           data-id="${product.id}"
           data-wedding-cat="${product.weddingCategory || 'all'}"
           onmouseenter="handleWeddingProductHover('${product.id}')"
           onclick="handleWeddingProductSelect('${product.id}')"
           style="--card-theme-color: ${productColor}; --card-theme-glow: ${productGlow}; cursor: pointer;">
        <div class="product-thumb-wrap" onclick="openProductModal('${product.id}')">
          <img src="${product.images[0]}" alt="${product.name}" class="product-img" loading="lazy">
          ${badgeText ? `<span class="product-badge" style="background: linear-gradient(135deg, var(--accent-gold), #B38639);">${badgeText}</span>` : ''}
          ${isOwner ? `
            <div class="admin-card-badge-tools">
              <button type="button" class="btn-admin-icon edit" onclick="event.stopPropagation(); openEditProductModal('${product.id}')" title="تعديل بيانات وصور المنتج">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="btn-admin-icon delete" onclick="event.stopPropagation(); deleteProductById('${product.id}')" title="حذف المنتج نهائياً من المتجر">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          ` : ''}
          <button class="quick-view-overlay-btn" type="button">
            <i class="fas fa-eye"></i> تفاصيل وزوايا ليلة العمر (${product.images.length} صور)
          </button>
        </div>
        
        <div class="product-info">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 0.78rem; font-weight: 700; color: ${productColor};">
              ${deptNames[product.weddingCategory] || "تجهيزات ليلة العمر"}
            </span>
            <span style="font-size: 0.75rem; color: #27AE60; font-weight: 600;"><i class="fas fa-check-circle"></i> هاندميد أبدي</span>
          </div>

          <h3 class="product-title" onclick="openProductModal('${product.id}')">${product.name}</h3>
          
          <p class="product-short-desc-text" style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${product.shortDesc}
          </p>

          <div class="product-rating">
            <span>★</span>
            <strong>${product.rating}</strong>
            <span class="reviews-count">(${product.reviewsCount} تقييم عرائس)</span>
          </div>

          <div class="product-price-row">
            <span class="current-price">${product.basePrice} <span class="currency">ج.م</span></span>
            ${product.oldPrice ? `<span class="old-price">${product.oldPrice} ج.م</span>` : ''}
          </div>

          <div class="product-card-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button class="btn-add-cart" onclick="quickAddToCart('${product.id}')" style="padding: 9px 8px; font-size: 0.88rem;">
              <i class="fas fa-shopping-bag"></i> أضف للسلة
            </button>
            <button class="btn-secondary" onclick="openProductModal('${product.id}')" style="padding: 9px 8px; font-size: 0.88rem; border-color: var(--accent-gold); color: var(--accent-gold);">
              <i class="fas fa-feather-alt"></i> تخصيص
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // استدعاء أولي لتحديث لون الصفحة بالقسم النشط
  applyWeddingPageTheme(appState.activeWeddingDept || 'all');
}

/* ==========================================================================
   إدارة مودال طلب باكدج العرسان الكاملة (Wedding Bundle Modal)
   مع خصم 15% فوري على إجمالي الباكدج
   ========================================================================== */

// جلب قائمة المنتجات الحصرية الموجودة داخل صندوق العرسان
function getWeddingBoxProducts() {
  const defaultIds = [
    "shatha-wedding-ivory-bridal",
    "shatha-wedding-frame-glass",
    "shatha-wedding-bridal-necklace",
    "shatha-wedding-fingerprint-tree"
  ];
  let boxIds = defaultIds;
  try {
    const saved = localStorage.getItem('shatha_wedding_box_ids');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        boxIds = parsed;
      }
    }
  } catch (e) {}

  const list = [];
  const seenIds = new Set();

  boxIds.forEach(id => {
    let prod = (appState.products || []).find(p => p.id === id);
    if (!prod && typeof SHATHA_PRODUCTS !== 'undefined') {
      prod = SHATHA_PRODUCTS.find(p => p.id === id);
    }
    if (prod && !seenIds.has(prod.id)) {
      list.push(prod);
      seenIds.add(prod.id);
    }
  });

  // إضافة أي منتج مخصص داخل الصندوق أضافه المالك
  (appState.products || []).forEach(p => {
    if (p.isWeddingBox === true && !seenIds.has(p.id)) {
      list.push(p);
      seenIds.add(p.id);
    }
  });

  return list;
}

let selectedBundleProductIds = new Set();

function openWeddingBundleModal() {
  const modal = document.getElementById("weddingBundleModal");
  const backdrop = document.getElementById("modalBackdrop");
  if (!modal) return;

  const boxProducts = getWeddingBoxProducts();
  const container = document.getElementById("weddingBundleItemsList");

  selectedBundleProductIds.clear();
  boxProducts.forEach(p => selectedBundleProductIds.add(p.id));

  if (container) {
    if (boxProducts.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 15px;">لا توجد منتجات مسجلة داخل الصندوق حالياً.</p>`;
    } else {
      container.innerHTML = `
        <div style="font-size: 0.85rem; font-weight: 700; color: var(--accent-gold); margin-bottom: 8px;">
          <i class="fas fa-box-open"></i> محتويات صندوق العرسان الحالية (${boxProducts.length} قطع مختارة):
        </div>
        ${boxProducts.map(p => {
          const isChecked = selectedBundleProductIds.has(p.id);
          const pImg = (p.images && p.images[0]) ? p.images[0] : (p.image || "assets/images/logo.jpg");
          return `
            <div class="wedding-bundle-item-card ${isChecked ? 'selected' : ''}" id="wbCard_${p.id}" onclick="toggleBundleItem('${p.id}', event)">
              <input type="checkbox" class="wb-checkbox" id="wbCheck_${p.id}" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleBundleItem('${p.id}')">
              <img src="${pImg}" alt="${p.name}" class="wb-thumb" onclick="event.stopPropagation(); openProductModal('${p.id}')" title="عرض تفاصيل وصور هذه القطعة">
              <div class="wb-info" onclick="toggleBundleItem('${p.id}')">
                <h5 class="wb-title">${p.name}</h5>
                <span class="wb-dept-tag">${p.shortDesc ? p.shortDesc.slice(0, 52) + '...' : 'شغل هاندميد ليلة العمر'}</span>
              </div>
              <div class="wb-actions-right">
                <div class="wb-price">${p.basePrice} ج.م</div>
                <button type="button" class="btn-wb-preview" onclick="event.stopPropagation(); openProductModal('${p.id}')" title="عرض تفاصيل وصور المنتج كاملة">
                  <i class="fas fa-eye"></i> التفاصيل
                </button>
              </div>
            </div>
          `;
        }).join('')}
      `;
    }
  }

  calcWeddingBundleTotal();

  backdrop?.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeWeddingBundleModal() {
  const modal = document.getElementById("weddingBundleModal");
  const backdrop = document.getElementById("modalBackdrop");
  modal?.classList.remove("active");
  backdrop?.classList.remove("active");
  document.body.style.overflow = "auto";
}

function toggleBundleItem(prodId, ev) {
  if (ev && ev.target && ev.target.type === 'checkbox') {
    // تم النقر على مربع الاختيار مباشرة
  } else {
    const cb = document.getElementById(`wbCheck_${prodId}`);
    if (cb) cb.checked = !cb.checked;
  }

  const isChecked = document.getElementById(`wbCheck_${prodId}`)?.checked;
  const card = document.getElementById(`wbCard_${prodId}`);
  if (isChecked) {
    selectedBundleProductIds.add(prodId);
    card?.classList.add("selected");
  } else {
    selectedBundleProductIds.delete(prodId);
    card?.classList.remove("selected");
  }

  calcWeddingBundleTotal();
}

function calcWeddingBundleTotal() {
  let rawTotal = 0;
  const boxProducts = getWeddingBoxProducts();
  selectedBundleProductIds.forEach(id => {
    let p = (appState.products || []).find(item => item.id === id);
    if (!p) p = boxProducts.find(item => item.id === id);
    if (!p && typeof SHATHA_PRODUCTS !== 'undefined') p = SHATHA_PRODUCTS.find(item => item.id === id);
    if (p) rawTotal += (p.basePrice || 0);
  });

  const discount = Math.round(rawTotal * 0.20); // وفر 20% فوري على الصندوق المتكامل
  const finalPrice = Math.max(0, rawTotal - discount);

  const rawEl = document.getElementById("wbRawTotal");
  const discEl = document.getElementById("wbDiscountAmount");
  const finalEl = document.getElementById("wbFinalPrice");

  if (rawEl) rawEl.innerText = `${rawTotal} ج.م`;
  if (discEl) discEl.innerText = `-${discount} ج.م`;
  if (finalEl) finalEl.innerText = `${finalPrice} ج.م`;

  return { rawTotal, discount, finalPrice };
}

function addWeddingBundleToCart() {
  if (selectedBundleProductIds.size === 0) {
    showToast("يرجى اختيار قطعة واحدة على الأقل من داخل صندوق العرسان", "error");
    return;
  }

  const { rawTotal, discount, finalPrice } = calcWeddingBundleTotal();
  const coupleNames = document.getElementById("wbCoupleNames")?.value.trim() || "عروسي شذى";
  const weddingDate = document.getElementById("wbWeddingDate")?.value || "قريباً";
  const colorTheme = document.getElementById("wbColorTheme")?.value || "أوف وايت عاجي ولؤلؤ";
  const notes = document.getElementById("wbNotes")?.value.trim() || "";

  const boxProducts = getWeddingBoxProducts();
  const selectedProducts = Array.from(selectedBundleProductIds)
    .map(id => (appState.products || []).find(p => p.id === id) || boxProducts.find(p => p.id === id) || (typeof SHATHA_PRODUCTS !== 'undefined' ? SHATHA_PRODUCTS.find(p => p.id === id) : null))
    .filter(Boolean);

  const itemNames = selectedProducts.map(p => p.name.split(' - ')[0]).join(' + ');
  const mainImage = (selectedProducts[0] && selectedProducts[0].images && selectedProducts[0].images[0]) ? selectedProducts[0].images[0] : "assets/images/wedding-box-open.jpg";
  const bundleCartKey = `wb_bundle_${Date.now()}`;

  const bundleCartItem = {
    cartKey: bundleCartKey,
    productId: "wedding-box-bundle",
    name: "صندوق العرسان الملكي المتكامل 🎁💍",
    image: mainImage,
    sizeId: "wedding_bundle",
    sizeName: `محتويات الصندوق (${selectedProducts.length} قطع) - وفرتِ ${discount} ج.م`,
    price: finalPrice,
    quantity: 1,
    customText: `العروسين: ${coupleNames} • الموعد: ${weddingDate} • الثيم: ${colorTheme} • محتويات الصندوق: [${itemNames}]${notes ? ` • ملاحظات: ${notes}` : ''}`,
    isWeddingBundle: true,
    bundleDetails: {
      rawTotal,
      discount,
      coupleNames,
      weddingDate,
      colorTheme,
      notes,
      items: selectedProducts.map(p => p.name)
    }
  };

  appState.cart.push(bundleCartItem);
  saveCartToStorage();
  updateCartUI();
  closeWeddingBundleModal();

  showToast(`🎉 ألف مبروك! تمت إضافة صندوق العرسان المتكامل (${selectedProducts.length} قطع) لسلتك!`, "success");
  openCartDrawer();
}

function sendWeddingBundleToWhatsApp() {
  if (selectedBundleProductIds.size === 0) {
    showToast("يرجى اختيار قطعة واحدة على الأقل من داخل صندوق العرسان", "error");
    return;
  }

  const { rawTotal, discount, finalPrice } = calcWeddingBundleTotal();
  const coupleNames = document.getElementById("wbCoupleNames")?.value.trim() || "غير محدد بعد";
  const weddingDate = document.getElementById("wbWeddingDate")?.value || "سيتم تحديده لاحقاً";
  const colorTheme = document.getElementById("wbColorTheme")?.value || "أوف وايت عاجي ولؤلؤ";
  const notes = document.getElementById("wbNotes")?.value.trim() || "لا توجد ملاحظات إضافية";

  const boxProducts = getWeddingBoxProducts();
  const selectedProducts = Array.from(selectedBundleProductIds)
    .map(id => (appState.products || []).find(p => p.id === id) || boxProducts.find(p => p.id === id) || (typeof SHATHA_PRODUCTS !== 'undefined' ? SHATHA_PRODUCTS.find(p => p.id === id) : null))
    .filter(Boolean);

  let msg = `🌸 *طلب صندوق العرسان الملكي من متجر شذى* 🎁💍\n\n`;
  msg += `👰🤵 *أسماء العروسين:* ${coupleNames}\n`;
  msg += `📅 *تاريخ الفرح / عقد القران:* ${weddingDate}\n`;
  msg += `🎨 *لون ثيم الفرح المفضل:* ${colorTheme}\n\n`;
  msg += `✨ *محتويات الصندوق المختارة (${selectedProducts.length} قطع):*\n`;

  selectedProducts.forEach((p, idx) => {
    msg += `${idx + 1}. ${p.name} (${p.basePrice} ج.م)\n`;
  });

  msg += `\n💵 *إجمالي القطع قبل الخصم:* ${rawTotal} ج.م\n`;
  msg += `🎁 *وفرتِ 20% فوري على الصندوق:* -${discount} ج.م\n`;
  msg += `💎 *السعر النهائي لصندوق العرسان:* *${finalPrice} ج.م*\n`;
  if (notes) {
    msg += `📝 *ملاحظات خاصة:* ${notes}\n`;
  }
  msg += `\nيسعدني تأكيد الحجز والتنسيق معكم لليلة العمر 🌸💍`;

  const waUrl = `https://wa.me/${SHATHA_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, "_blank");
}

function closeAllModals() {
  closeCartDrawer();
  closeProductModal();
  closeCheckoutModal();
  closeAddProductModal();
  closeWeddingBundleModal();
  if (typeof closeShathaAuthModal === 'function') closeShathaAuthModal();
  if (typeof closeShathaAccountModal === 'function') closeShathaAccountModal();
  if (typeof closeSecretPasswordModal === 'function') closeSecretPasswordModal();
  if (typeof closeSuccessModal === 'function') closeSuccessModal();
  document.querySelectorAll(".policy-modal").forEach(m => m.classList.remove("active"));
  const backdrop = document.getElementById("modalBackdrop");
  if (backdrop) backdrop.classList.remove("active");
  document.body.style.overflow = "auto";
}

/* ==========================================================================
   المسرح التفاعلي ثلاثي الأبعاد لصندوق العرسان (Wedding Mystery Box 3D Carousel)
   تحكم كامل في فتح الصندوق، انفجار الجليتر، والدوران الدائري التفاعلي باللمس والماوس
   ========================================================================== */

const weddingBoxState = {
  isOpen: false,
  currentAngle: 0,
  currentIndex: 0,
  radius: 300,
  isDragging: false,
  startX: 0,
  dragStartAngle: 0,
  hasDragged: false,
  autoRotateTimer: null,
  isAutoRotating: false,
  itemsCount: 4
};

// تشغيل صوت رقيق ساحر لفتح الصندوق (Web Audio API أصلي بدون ملفات خارجية)
function playMagicChimeSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + idx * 0.08 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.7);
    });
  } catch (e) {
    // تجاهل إذا كان المتصفح يقيد الصوت التلقائي
  }
}

// توليد انفجار الجليتر والنجوم الذهبية عند فتح الصندوق
function createSparkleBurstEffect(anchorEl) {
  if (!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const symbols = ["✨", "✦", "💍", "🌸", "⭐", "💎", "💐"];
  const count = 28;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.innerText = symbols[Math.floor(Math.random() * symbols.length)];
    el.style.position = "fixed";
    el.style.left = centerX + "px";
    el.style.top = centerY + "px";
    el.style.fontSize = (14 + Math.random() * 20) + "px";
    el.style.color = Math.random() > 0.5 ? "#D4AF37" : "#BF7279";
    el.style.pointerEvents = "none";
    el.style.zIndex = "99999";
    el.style.transition = "all 0.9s cubic-bezier(0.1, 0.8, 0.2, 1)";
    el.style.opacity = "1";
    document.body.appendChild(el);

    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * 200;
    const destX = Math.cos(angle) * distance;
    const destY = Math.sin(angle) * distance - (40 + Math.random() * 60);

    requestAnimationFrame(() => {
      el.style.transform = `translate(${destX}px, ${destY}px) scale(${0.4 + Math.random() * 0.8}) rotate(${Math.random() * 360}deg)`;
      el.style.opacity = "0";
    });

    setTimeout(() => {
      el.remove();
    }, 1000);
  }
}

// دالة فتح صندوق العرسان التفاعلي
function openWeddingBoxInteractive() {
  const closedView = document.getElementById("mysteryBoxClosedView");
  const openedView = document.getElementById("mysteryBoxOpenedView");
  const boxModel = document.getElementById("mysteryBox3dImg");
  const subtitle = document.getElementById("stageSubtitleText");

  if (!closedView || !openedView) return;

  // تشغيل انميشن اهتزاز وتوهج الصندوق والصوت الرقيق بأمان تام
  try { playMagicChimeSound(); } catch (e) {}
  try { createSparkleBurstEffect(boxModel || closedView); } catch (e) {}

  if (boxModel) {
    boxModel.classList.add("box-opening-active");
  }

  try { showToast("مبارك! تم فتح صندوق العرسان الملكي بنجاح 🎁💍", "success"); } catch (e) {}

  setTimeout(() => {
    closedView.style.display = "none";
    openedView.classList.add("active");
    weddingBoxState.isOpen = true;

    if (subtitle) {
      subtitle.innerHTML = `✨ تصفحي محتويات صندوق العرسان الأربعة: يمكنك تحريك الدائرة ثلاثية الأبعاد بيدك أو بالأسهم، واضغطي على أي قطعة لعرض تفاصيلها وسعرها.`;
    }

    try {
      renderWeddingBoxCards();
    } catch (e) {
      console.error("renderWeddingBoxCards error:", e);
    }
  }, 450);
}
window.openWeddingBoxInteractive = openWeddingBoxInteractive;

// دالة إعادة إغلاق الصندوق للتجربة مجدداً
function closeWeddingBoxInteractive() {
  const closedView = document.getElementById("mysteryBoxClosedView");
  const openedView = document.getElementById("mysteryBoxOpenedView");
  const boxModel = document.getElementById("mysteryBox3dImg");
  const subtitle = document.getElementById("stageSubtitleText");

  if (!closedView || !openedView) return;

  openedView.classList.remove("active");
  setTimeout(() => {
    closedView.style.display = "flex";
    if (boxModel) boxModel.classList.remove("box-opening-active");
    weddingBoxState.isOpen = false;

    if (subtitle) {
      subtitle.innerHTML = `الصندوق الأسطوري الذي يجمع أهم 4 قطع هاندميد في ليلة العمر. اضغط على الصندوق لفتحه واستكشاف محتوياته التي تدور في حلقة ثلاثية الأبعاد!`;
    }
  }, 400);
}

// رسم وتحديث كروت منتجات صندوق العرسان الملكي التفاعلي مع أدوات المالك
function renderWeddingBoxCards() {
  const ring = document.getElementById("carousel3dRing");
  if (!ring) return;

  const isOwner = isCurrentUserOwner();
  const ownerAddBtn = document.getElementById("ownerAddBoxItemBtn");
  if (ownerAddBtn) {
    ownerAddBtn.style.display = isOwner ? "inline-flex" : "none";
  }

  const boxProducts = getWeddingBoxProducts();

  const defaultBadges = [
    "💐 بوكيه العروسة الكبير",
    "🖼️ برواز ليلة العمر 3D",
    "👑 عقد العروسة الملكي",
    "📜 بصمة كتب الكتاب"
  ];
  const defaultIcons = ["💐", "🖼️", "👑", "📜"];

  const cardsHtml = boxProducts.map((prod, index) => {
    const pId = prod.id;
    const pName = prod.name;
    const pPrice = prod.basePrice;
    const pOld = prod.oldPrice;
    const pImg = (prod.images && prod.images[0]) ? prod.images[0] : (prod.image || "assets/images/logo.jpg");
    const pRating = prod.rating || 5.0;
    const pReviews = prod.reviewsCount || 25;
    const discount = pOld ? Math.round(((pOld - pPrice) / pOld) * 100) : 20;
    const badge = prod.tag || defaultBadges[index] || "💍 قطعة الصندوق الملكي";

    return `
      <div class="product-3d-circle-card ${index === weddingBoxState.currentIndex ? 'is-front' : ''}" 
           data-index="${index}" 
           data-id="${pId}" 
           onclick="handle3dCardClick('${pId}', ${index})">
        
        <div class="card-3d-thumb-wrap">
          <img src="${pImg}" alt="${pName}" class="card-3d-img">
          <span class="card-3d-badge">${badge}</span>
          <span class="card-3d-front-sparkle"><i class="fas fa-star"></i> الواجهة الرئيسية</span>

          ${isOwner ? `
            <div class="card-3d-admin-badge" onclick="event.stopPropagation()">
              <button type="button" class="btn-3d-admin-edit" onclick="event.stopPropagation(); openEditProductModal('${pId}')" title="تعديل هذا المنتج (المالك)">
                <i class="fas fa-pen"></i> تعديل
              </button>
              <button type="button" class="btn-3d-admin-delete" onclick="event.stopPropagation(); deleteProductById('${pId}')" title="حذف هذا المنتج (المالك)">
                <i class="fas fa-trash-alt"></i> حذف
              </button>
            </div>
          ` : ''}
        </div>

        <div class="card-3d-body">
          <div>
            <h4 class="card-3d-title">${pName}</h4>
            <div class="card-3d-rating-row">
              <span>★★★★★</span>
              <strong>${pRating}</strong>
              <span class="count">(${pReviews} تقييم عرائس)</span>
            </div>
          </div>
          <div>
            <div class="card-3d-price-row">
              <div>
                <span class="curr-price">${pPrice} ج.م</span>
                ${pOld ? `<span class="old-price">${pOld} ج.م</span>` : ''}
              </div>
              <span class="save-tag">خصم ${discount}%</span>
            </div>
            <button type="button" class="btn-card-3d-details" onclick="event.stopPropagation(); openProductModal('${pId}')" title="عرض تفاصيل وصور المنتج">
              <i class="fas fa-eye"></i> عرض التفاصيل والسعر 🔍
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  ring.innerHTML = cardsHtml;

  // تحديث أزرار التنقل السريع بالأسفل
  const dotsContainer = document.getElementById("carouselItemDots");
  if (dotsContainer) {
    dotsContainer.innerHTML = boxProducts.map((prod, idx) => {
      const icon = defaultIcons[idx] || "🎁";
      const shortName = prod.name.split(' - ')[0].slice(0, 18);
      return `
        <button type="button" class="carousel-dot-btn ${idx === weddingBoxState.currentIndex ? 'active' : ''}" onclick="jumpToCarouselItem(${idx})">
          <span>${icon}</span> <span>${shortName}</span>
        </button>
      `;
    }).join('');
  }

  initCarousel3D();
}

// تهيئة أبعاد ومواضع الدائرة ثلاثية الأبعاد (3D Carousel Initialization)
function initCarousel3D() {
  const ring = document.getElementById("carousel3dRing");
  const viewport = document.getElementById("carousel3dViewport");
  if (!ring || !viewport) return;

  const cards = ring.querySelectorAll(".product-3d-circle-card");
  const count = cards.length || 4;
  weddingBoxState.itemsCount = count;

  // حساب نصف القطر المناسب وفقاً لعرض الشاشة وعدد الكروت
  const winWidth = window.innerWidth;
  if (winWidth <= 420) {
    weddingBoxState.radius = Math.max(135, Math.round(count * 32));
  } else if (winWidth <= 650) {
    weddingBoxState.radius = Math.max(160, Math.round(count * 38));
  } else if (winWidth <= 768) {
    weddingBoxState.radius = Math.max(210, Math.round(count * 48));
  } else {
    weddingBoxState.radius = Math.max(290, Math.round(count * 64));
  }

  // توزيع الكروت بانتظام في الفضاء الثلاثي الأبعاد
  cards.forEach((card, index) => {
    const cardAngle = index * (360 / count);
    card.style.transform = `rotateY(${cardAngle}deg) translateZ(${weddingBoxState.radius}px)`;
  });

  applyCarouselRotation();
  setupCarouselInteractions();
}

// تطبيق زاوية دوران الأسطوانة وتحديث الكارت النشط والنقاط
function applyCarouselRotation() {
  const ring = document.getElementById("carousel3dRing");
  if (!ring || !weddingBoxState.itemsCount) return;

  ring.style.transform = `rotateY(${weddingBoxState.currentAngle}deg)`;

  // حساب أي كارت موجود حالياً في الواجهة الأمامية
  const count = weddingBoxState.itemsCount;
  const step = 360 / count;
  const normalizedAngle = ((-weddingBoxState.currentAngle % 360) + 360) % 360;
  const frontIndex = Math.round(normalizedAngle / step) % count;
  weddingBoxState.currentIndex = frontIndex;

  // تحديث تمييز الكارت النشط
  const cards = ring.querySelectorAll(".product-3d-circle-card");
  cards.forEach((card, idx) => {
    if (idx === frontIndex) {
      card.classList.add("is-front");
    } else {
      card.classList.remove("is-front");
    }
  });

  // تحديث أزرار التنقل السريعة
  const dotBtns = document.querySelectorAll(".carousel-dot-btn");
  dotBtns.forEach((btn, idx) => {
    if (idx === frontIndex) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

// تدوير الدائرة بمقدار خطوة (direction = 1 لليسار، -1 لليمين)
function rotateCarousel3D(direction) {
  const count = weddingBoxState.itemsCount || 4;
  const step = 360 / count;
  weddingBoxState.currentAngle -= direction * step;
  applyCarouselRotation();
}

// القفز المباشر لكارت معين عند الضغط على أزراره بالأسفل
function jumpToCarouselItem(targetIndex) {
  const count = weddingBoxState.itemsCount || 4;
  const step = 360 / count;
  const currentNorm = ((-weddingBoxState.currentAngle % 360) + 360) % 360;
  const currentIdx = Math.round(currentNorm / step) % count;

  let diff = targetIndex - currentIdx;
  const half = count / 2;
  if (diff > half) diff -= count;
  if (diff < -half) diff += count;

  weddingBoxState.currentAngle -= diff * step;
  applyCarouselRotation();
}

// التعامل مع الضغط على أي كارت داخل الدائرة
function handle3dCardClick(productId, cardIndex) {
  // إذا كان المستخدم يقوم بسحب فعلي حقيقي للدائرة، نتجاهل الفتح
  if (weddingBoxState.hasDragged) {
    weddingBoxState.hasDragged = false;
    return;
  }

  // محاذاة الكارت وفتح تفاصيل وسعر المنتج فوراً بدون أي تعليق
  if (typeof cardIndex === 'number' && cardIndex !== weddingBoxState.currentIndex) {
    jumpToCarouselItem(cardIndex);
    setTimeout(() => {
      openProductModal(productId);
    }, 120);
  } else {
    openProductModal(productId);
  }
}

// إعداد سحب وتدوير الدائرة بالماوس وعلى شاشات اللمس (Touch & Mouse Drag)
function setupCarouselInteractions() {
  const viewport = document.getElementById("carousel3dViewport");
  const ring = document.getElementById("carousel3dRing");
  if (!viewport || viewport.dataset.dragBound === "true") return;

  viewport.dataset.dragBound = "true";

  const onPointerDown = (e) => {
    // إذا كان النقر على زر أو رابط أو أداة المالك، لا نفعّل وضع السحب أبداً
    if (e.target.closest('button, a, .btn-card-3d-details, .btn-3d-admin-edit, .btn-3d-admin-delete, .carousel-nav-btn, .carousel-dot-btn')) {
      weddingBoxState.isDragging = false;
      return;
    }

    weddingBoxState.isDragging = true;
    weddingBoxState.hasDragged = false;
    weddingBoxState.pointerDownTime = Date.now();
    weddingBoxState.startX = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) || 0;
    weddingBoxState.startY = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY) || 0;
    weddingBoxState.dragStartAngle = weddingBoxState.currentAngle;
    if (ring) ring.classList.add("dragging");
  };

  const onPointerMove = (e) => {
    if (!weddingBoxState.isDragging) return;
    const currentX = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) || 0;
    const currentY = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY) || 0;
    const deltaX = currentX - weddingBoxState.startX;
    const deltaY = currentY - weddingBoxState.startY;

    // تمييز السحب الحقيقي فقط: مسافة أفقية واضحة أكبر من 25 بكسل وأكبر من الحركة الرأسية
    if (Math.abs(deltaX) > 25 && Math.abs(deltaX) > Math.abs(deltaY)) {
      weddingBoxState.hasDragged = true;
    }

    if (weddingBoxState.hasDragged) {
      // تتبع فوري بحساسية انسيابية
      weddingBoxState.currentAngle = weddingBoxState.dragStartAngle + (deltaX * 0.42);
      if (ring) ring.style.transform = `rotateY(${weddingBoxState.currentAngle}deg)`;
    }
  };

  const onPointerUp = () => {
    if (!weddingBoxState.isDragging) return;
    const elapsed = Date.now() - (weddingBoxState.pointerDownTime || 0);
    weddingBoxState.isDragging = false;
    if (ring) ring.classList.remove("dragging");

    // إذا كانت لمسة سريعة أو لم يتم سحب كافٍ، لا نعتبره سحباً لكي تفتح تفاصيل المنتج فوراً
    if (elapsed < 240 || !weddingBoxState.hasDragged) {
      weddingBoxState.hasDragged = false;
      return;
    }

    // محاذاة تلقائية (Snap) لأقرب كارت بعد ترك السحب
    const count = weddingBoxState.itemsCount || 4;
    const step = 360 / count;
    weddingBoxState.currentAngle = Math.round(weddingBoxState.currentAngle / step) * step;
    applyCarouselRotation();

    setTimeout(() => {
      weddingBoxState.hasDragged = false;
    }, 40);
  };

  viewport.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);

  viewport.addEventListener("touchstart", onPointerDown, { passive: true });
  window.addEventListener("touchmove", onPointerMove, { passive: true });
  window.addEventListener("touchend", onPointerUp);
  window.addEventListener("touchcancel", onPointerUp);

  // تحديث نصف القطر عند تغيير حجم النافذة
  window.addEventListener("resize", () => {
    if (weddingBoxState.isOpen) {
      initCarousel3D();
    }
  });

  // دعم إغلاق النوافذ بزر Escape
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc") {
      closeProductModal();
      closeUniversalPolicyModal();
    }
  });
}

/* ==========================================================================
   إزالة خلفية الصندوق المغلق وجعله عائماً بحجم كبير ثلاثي الأبعاد
   ========================================================================== */

function initMysteryBox3D() {
  const boxImg = document.getElementById("mysteryBox3dImg");
  if (!boxImg) return;

  // تنظيف الكاش القديم دائماً لإجبار إعادة المعالجة
  try {
    ["v1","v2","v3","v4","v5","v6","v7"].forEach(v =>
      localStorage.removeItem("shatha_box_clean_png_" + v)
    );
  } catch(e) {}

  const CACHE_KEY = "shatha_box_clean_png_v9";
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached && cached.startsWith("data:image/png")) {
    boxImg.src = cached;
    boxImg.classList.add("bg-removed");
    return;
  }

  const removeBg = () => {
    try {
      const w = boxImg.naturalWidth  || boxImg.width;
      const h = boxImg.naturalHeight || boxImg.height;
      if (!w || !h || w < 50 || h < 50) return;

      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(boxImg, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      /*
       * الصورة: صندوق داكن (رمادي غامق + حواف ذهبية + فيونكة حمراء)
       * على خلفية استوديو وردية فاتحة مع أضواء bokeh
       *
       * منطق الإزالة:
       *   1. أي بكسل فاتح جداً (brightness > 160) مع نبرة وردية → خلفية
       *   2. أي بكسل خارج حدود الصندوق الهندسية → شفاف
       *   3. الصندوق نفسه داكن: r,g,b < 130 أو ذهبي r>g>b أو أحمر قطيفي
       */

      // نسمح بهامش بسيط حول الصندوق
      const LEFT   = Math.floor(w * 0.04);
      const RIGHT  = Math.floor(w * 0.97);
      const TOP    = Math.floor(h * 0.28);
      const BOTTOM = Math.floor(h * 0.93);

      let minX = w, minY = h, maxX = 0, maxY = 0;
      let kept = 0;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        const x = (i / 4) % w;
        const y = Math.floor((i / 4) / w);

        // خارج الحدود → شفاف تماماً
        if (x < LEFT || x > RIGHT || y < TOP || y > BOTTOM) {
          d[i+3] = 0;
          continue;
        }

        // كشف الخلفية الوردية/البيضاء بدقة:
        // الخلفية لها: r > g > b، ولونها فاتح (r > 150)
        const brightness = (r + g + b) / 3;
        const isLight    = brightness > 155;
        const isPinkish  = r > g && r > b && (r - b) > 20;   // أكثر أحمر من أزرق
        const isWhitish  = r > 200 && g > 190 && b > 190;    // أبيض/رمادي فاتح جداً

        // أضواء bokeh: دوائر وردية مضيئة جداً
        const isBokeh    = brightness > 180 && isPinkish;

        // هل هو لون الصندوق الداكن؟
        const isDark     = r < 110 && g < 110 && b < 110;    // جسم الصندوق الداكن
        const isGold     = r > 130 && g > 90  && b < 80 && (r - b) > 60; // حواف ذهبية
        const isRed      = r > 120 && g < 80  && b < 80;     // فيونكة حمراء قطيفية
        const isDarkGray = r < 130 && g < 130 && b < 130 && brightness < 130;

        const isBox = isDark || isGold || isRed || isDarkGray;

        if (!isBox && (isLight || isPinkish || isWhitish || isBokeh)) {
          // خلفية → شفاف
          d[i+3] = 0;
        } else {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          kept++;
        }
      }

      if (kept < 100) return; // لم ننجح في الإزالة

      ctx.putImageData(imgData, 0, 0);

      // اقتصاص المنطقة المحتوية على الصندوق فقط
      const pad = 5;
      const cx = Math.max(0, minX - pad);
      const cy = Math.max(0, minY - pad);
      const cw = Math.min(w, maxX + pad) - cx;
      const ch = Math.min(h, maxY + pad) - cy;

      if (cw > 50 && ch > 50) {
        const crop = document.createElement("canvas");
        crop.width  = cw;
        crop.height = ch;
        crop.getContext("2d").drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);

        const cleanPng = crop.toDataURL("image/png");
        boxImg.src = cleanPng;
        boxImg.classList.add("bg-removed");

        try { localStorage.setItem(CACHE_KEY, cleanPng); } catch(e) {}
      }
    } catch(err) {
      // ملف محلي أو تعطيل Canvas CORS → clip-path من CSS يعمل تلقائياً
    }
  };

  if (boxImg.complete && boxImg.naturalWidth > 0) {
    removeBg();
  } else {
    boxImg.addEventListener("load", removeBg);
  }
}


/* ==========================================================================
   إدارة وتحديث صورة واجهة صندوق العرسان لمالك المتجر (Showcase Image Controls)
   ========================================================================== */

function initWeddingBoxShowcase() {
  const showcaseImg = document.getElementById("weddingBoxShowcaseImg");
  const ownerTool = document.getElementById("wbOwnerImageTool");
  const isOwner = isCurrentUserOwner();

  // تحميل الصورة المخصصة المحفوظة لصندوق العرسان
  const savedImg = localStorage.getItem('shatha_wedding_box_showcase_img');
  if (showcaseImg && savedImg) {
    showcaseImg.src = savedImg;
  }

  // إظهار أو إخفاء زر التعديل لصندوق العرسان
  if (ownerTool) {
    ownerTool.style.display = isOwner ? "block" : "none";
  }

  const ownerAddBoxBtn = document.getElementById("ownerAddBoxItemBtn");
  if (ownerAddBoxBtn) {
    ownerAddBoxBtn.style.display = isOwner ? "inline-flex" : "none";
  }

  // تهيئة صور وأدوات المالك لكافة الباكدجات الخمسة
  initCategoryPackagesShowcase();
}

const CATEGORY_SHOWCASE_KEYS = ['bouquets', 'katb_ketab', 'frames', 'crowns', 'bags'];

// تهيئة صور واجهة باكدجات الأقسام وأدوات المالك
function initCategoryPackagesShowcase() {
  const isOwner = isCurrentUserOwner();

  CATEGORY_SHOWCASE_KEYS.forEach(key => {
    const imgEl = document.getElementById(`pkgShowcaseImg_${key}`);
    const toolEl = document.getElementById(`pkgOwnerTool_${key}`);

    // تحميل الصورة المخصصة المحفوظة محلياً إن وُجدت
    const saved = localStorage.getItem(`shatha_pkg_img_${key}`);
    if (imgEl && saved) {
      imgEl.src = saved;
    }

    // إظهار أو إخفاء زر التعديل للمالك
    if (toolEl) {
      toolEl.style.display = isOwner ? "block" : "none";
    }
  });
}

// تشغيل اختيار الصورة لباكدج معين للمالك
function triggerChangeCategoryPackageImage(pkgKey) {
  const isOwner = isCurrentUserOwner();
  if (!isOwner) {
    showToast("عذراً، تغيير صورة واجهة الباكدج متاح فقط لمالك متجر شذى بعد تسجيل الدخول.", "error");
    openAccountOrAuthModal();
    return;
  }

  const fileInput = document.getElementById(`ownerPkgFileInput_${pkgKey}`);
  if (fileInput) {
    fileInput.click();
  }
}

// قراءة وضغط وحفظ ومزامنة صورة باكدج جديدة
async function handleOwnerCategoryPackageImageChosen(pkgKey, files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  if (!file.type.startsWith('image/')) {
    showToast("يرجى اختيار ملف صورة صالح (JPG, PNG, WebP)", "error");
    return;
  }

  try {
    showToast("جاري تجهيز وضغط الصورة...", "info");
    const base64Img = await compressImageToBase64(file);

    // تحديث الواجهة فوراً
    const imgEl = document.getElementById(`pkgShowcaseImg_${pkgKey}`);
    if (imgEl) {
      imgEl.src = base64Img;
    }

    // الحفظ المحلي
    try {
      localStorage.setItem(`shatha_pkg_img_${pkgKey}`, base64Img);
    } catch(err) {
      console.warn("Storage quota full, continuing with cloud upload:", err);
    }

    // المزامنة السحابية الفورية
    if (typeof SHATHA_CLOUD !== 'undefined' && SHATHA_CLOUD.set) {
      await SHATHA_CLOUD.set(`shatha_pkg_img_${pkgKey}`, base64Img);
    }

    showToast("🎉 تم تحديث صورة واجهة الباكدج بنجاح ومزامنتها لجميع الزوار!", "success");
  } catch (err) {
    console.error("Error setting package image:", err);
    showToast("حدث خطأ أثناء معالجة الصورة، يرجى المحاولة بصورة أصغر", "error");
  }
}
window.triggerChangeCategoryPackageImage = triggerChangeCategoryPackageImage;
window.handleOwnerCategoryPackageImageChosen = handleOwnerCategoryPackageImageChosen;

// تشغيل اختيار الصورة للمالك (لصندوق العرسان)
function triggerChangeShowcaseImage() {
  const isOwner = isCurrentUserOwner();
  if (!isOwner) {
    showToast("عذراً، تغيير صورة الواجهة متاح فقط لمالك المتجر شذى بعد تسجيل الدخول.", "error");
    openAccountOrAuthModal();
    return;
  }

  const fileInput = document.getElementById("ownerShowcaseFileInput");
  if (fileInput) {
    fileInput.click();
  }
}

// قراءة وضغط وحفظ صورة الواجهة الجديدة
async function handleOwnerShowcaseFileChosen(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  if (!file.type.startsWith('image/')) {
    showToast("يرجى اختيار ملف صورة صالح (JPG, PNG, WebP)", "error");
    return;
  }

  try {
    showToast("جاري تجهيز وضغط الصورة...", "info");
    const base64Img = await compressImageToBase64(file);
    
    // تحديث الواجهة فوراً
    const showcaseImg = document.getElementById("weddingBoxShowcaseImg");
    if (showcaseImg) {
      showcaseImg.src = base64Img;
    }

    // الحفظ المحلي
    try {
      localStorage.setItem('shatha_wedding_box_showcase_img', base64Img);
    } catch(err) {
      console.warn("Storage quota full, continuing with cloud upload:", err);
    }

    // المزامنة السحابية الفورية
    const cloudSync = await SHATHA_CLOUD.set('wedding_box_showcase_img', base64Img);
    if (cloudSync) {
      console.log("☁️ تم رفع وتحديث صورة صندوق العرسان على السحابة بنجاح!");
    }

    showToast("🎉 تم تحديث صورة واجهة صندوق العرسان بنجاح ومزامنتها لجميع الزوار!", "success");
  } catch (err) {
    console.error("Error setting showcase image:", err);
    showToast("حدث خطأ أثناء معالجة الصورة، يرجى المحاولة بصورة أصغر", "error");
  }
}
window.triggerChangeShowcaseImage = triggerChangeShowcaseImage;
window.handleOwnerShowcaseFileChosen = handleOwnerShowcaseFileChosen;

// مزامنة صورة الواجهة وقائمة الصندوق من السحابة في الخلفية
async function syncWeddingBoxFromCloud() {
  try {
    // 1. مزامنة صورة الواجهة
    const cloudImg = await SHATHA_CLOUD.get('wedding_box_showcase_img');
    if (cloudImg && typeof cloudImg === 'string' && cloudImg.length > 50) {
      localStorage.setItem('shatha_wedding_box_showcase_img', cloudImg);
      const showcaseImg = document.getElementById("weddingBoxShowcaseImg");
      if (showcaseImg) showcaseImg.src = cloudImg;
    }

    // 2. مزامنة معرّفات منتجات الصندوق
    const cloudBoxIds = await SHATHA_CLOUD.get('wedding_box_ids');
    if (Array.isArray(cloudBoxIds) && cloudBoxIds.length > 0) {
      localStorage.setItem('shatha_wedding_box_ids', JSON.stringify(cloudBoxIds));
      if (document.getElementById("weddingBoxStage")) {
        renderWeddingBoxCards();
      }
    }

    // 3. مزامنة صور واجهات كافة باكدجات الأقسام من السحابة
    for (const key of CATEGORY_SHOWCASE_KEYS) {
      const pkgImg = await SHATHA_CLOUD.get(`shatha_pkg_img_${key}`);
      if (pkgImg && typeof pkgImg === 'string' && pkgImg.length > 50) {
        localStorage.setItem(`shatha_pkg_img_${key}`, pkgImg);
        const imgEl = document.getElementById(`pkgShowcaseImg_${key}`);
        if (imgEl) imgEl.src = pkgImg;
      }
    }

    // 4. مزامنة صورة البوكيه الرئيسي من السحابة (hero bouquet)
    const cloudHeroImg = await SHATHA_CLOUD.get('hero_bouquet_img');
    if (cloudHeroImg && typeof cloudHeroImg === 'string' && cloudHeroImg.length > 50) {
      localStorage.setItem('shatha_hero_bouquet_img', cloudHeroImg);
      const heroImg = document.getElementById("heroBouquetImg");
      if (heroImg) heroImg.src = cloudHeroImg;
    }
  } catch(e) {
    console.warn("Wedding box cloud sync note:", e);
  }
}

/* ==========================================================================
   إدارة صورة البوكيه الرئيسي في واجهة الموقع (Hero Bouquet Image) — للمالك فقط
   ========================================================================== */

/**
 * تهيئة أداة تغيير صورة البوكيه الرئيسي في الصفحة الرئيسية
 * تُظهر الزر للمالك فقط وتُحمّل الصورة المخزّنة
 */
function initHeroBouquetShowcase() {
  const heroImg = document.getElementById("heroBouquetImg");
  const ownerTool = document.getElementById("heroOwnerImageTool");
  const isOwner = isCurrentUserOwner();

  // تحميل الصورة المخصصة المحفوظة للبوكيه الرئيسي
  const savedImg = localStorage.getItem('shatha_hero_bouquet_img');
  if (heroImg && savedImg && savedImg.length > 50) {
    heroImg.src = savedImg;
  }

  // إظهار أو إخفاء زر تعديل الصورة حسب هوية المستخدم
  if (ownerTool) {
    ownerTool.style.display = isOwner ? "block" : "none";
  }
}

/**
 * فتح نافذة اختيار صورة البوكيه الرئيسي (المالك فقط)
 */
function triggerChangeHeroBouquetImage() {
  if (!isCurrentUserOwner()) {
    showToast("هذه الخاصية متاحة لمالك المتجر فقط", "error");
    return;
  }
  const input = document.getElementById("ownerHeroFileInput");
  if (input) input.click();
}

/**
 * معالجة الصورة الجديدة للبوكيه الرئيسي بعد اختيارها
 */
function handleOwnerHeroBouquetFileChosen(files) {
  if (!isCurrentUserOwner() || !files || files.length === 0) return;
  const file = files[0];
  if (!file.type.startsWith("image/")) {
    showToast("يرجى اختيار ملف صورة صالح (JPG, PNG, WebP)", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const dataUrl = e.target.result;
      const heroImg = document.getElementById("heroBouquetImg");
      if (heroImg) heroImg.src = dataUrl;

      // حفظ الصورة محلياً ومزامنتها سحابياً
      try {
        localStorage.setItem('shatha_hero_bouquet_img', dataUrl);
      } catch(storErr) {
        console.warn("Hero img localStorage full, storing compressed:", storErr);
      }

      // مزامنة سحابية مع Firebase
      SHATHA_CLOUD.set('hero_bouquet_img', dataUrl).then(() => {
        showToast("✅ تم تحديث صورة البوكيه الرئيسي بنجاح ومزامنتها على جميع الأجهزة!", "success");
      }).catch(() => {
        showToast("✅ تم تحديث صورة البوكيه الرئيسي محلياً (جارٍ المزامنة...)", "success");
      });
    } catch(err) {
      showToast("حدث خطأ أثناء معالجة الصورة، يرجى المحاولة بصورة أصغر", "error");
    }
  };
  reader.readAsDataURL(file);
}

window.triggerChangeHeroBouquetImage = triggerChangeHeroBouquetImage;
window.handleOwnerHeroBouquetFileChosen = handleOwnerHeroBouquetFileChosen;
window.initHeroBouquetShowcase = initHeroBouquetShowcase;

// فحص فتح الصندوق تلقائياً وتهيئة الواجهة
document.addEventListener("DOMContentLoaded", () => {
  initWeddingBoxShowcase();
  initHeroBouquetShowcase();
  initMysteryBox3D();
  syncWeddingBoxFromCloud();

  if (document.getElementById("weddingBoxStage")) {
    renderWeddingBoxCards();

    // ربط الضغط البرمجي المباشر لعناصر الصندوق لضمان الفتح 100%
    const closedView = document.getElementById("mysteryBoxClosedView");
    const boxImg = document.getElementById("mysteryBox3dImg");
    const boxBadge = document.getElementById("boxTapBadge");

    if (closedView) closedView.addEventListener("click", openWeddingBoxInteractive);
    if (boxImg) boxImg.addEventListener("click", (e) => { e.stopPropagation(); openWeddingBoxInteractive(); });
    if (boxBadge) boxBadge.addEventListener("click", (e) => { e.stopPropagation(); openWeddingBoxInteractive(); });

    if (window.location.hash === "#box-open") {
      openWeddingBoxInteractive();
    }
  }
});


