/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { render } from 'preact';
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
// FIX: The 'html' template tag should be imported directly from 'htm/preact'.
import { html } from 'htm/preact';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const textModel = 'gemini-2.5-flash';
const imageModel = 'imagen-4.0-generate-001';

// --- Components ---

const ImportModal = ({ onCancel, onImport }) => {
  const [csvFile, setCsvFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [fileName, setFileName] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCsvFile(file);
      setFileName(file.name);
      setImportResult(null); // Reset result when a new file is chosen
    }
  };

  const handleDownloadTemplate = () => {
    const header = "name,brandName,category,subCategory,shade,stock,price,sellingPrice,rrpPrice,purchaseFrom,invoiceNo,keywords,description\n";
    const example = "Blue Ballpoint Pen,Stationary Brand,Stationery,Pens,Blue,100,0.20,0.50,0.60,Supplier Inc.,INV-123,smooth writing,A high quality blue ballpoint pen for exams.";
    const csvContent = header + example;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "products_template.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleImport = async () => {
    if (!csvFile) return;

    setIsProcessing(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const { newProducts, errors } = onImport(text);
      setImportResult({
        successCount: newProducts.length,
        errorCount: errors.length,
        errors: errors,
      });
      setIsProcessing(false);
    };
    reader.onerror = () => {
        setImportResult({ successCount: 0, errorCount: 0, errors: [{row: 'File', message: 'Could not read the file.'}] });
        setIsProcessing(false);
    }
    reader.readAsText(csvFile);
  };
  
  return html`
    <div class="modal-overlay" onClick=${() => !isProcessing && onCancel()}>
      <div class="modal-content import-modal" onClick=${(e) => e.stopPropagation()}>
        <h2 class="modal-title">Import Products from CSV</h2>
        
        ${!importResult ? html`
          <div class="import-steps">
            <div class="import-step">
              <h3>Step 1: Get the Template</h3>
              <p>Download the template to ensure your data is formatted correctly. The 'name', 'brandName', 'category', 'subCategory', 'stock', and 'price' columns are required.</p>
              <button type="button" class="btn-secondary" onClick=${handleDownloadTemplate}>Download Template</button>
            </div>
            <div class="import-step">
              <h3>Step 2: Upload Your File</h3>
              <p>The 'brandName' in your file must match an existing brand in your system (case-insensitive). Rows with non-matching brands will be skipped.</p>
              <div class="file-upload-wrapper">
                <input type="file" id="csv-upload" accept=".csv" onChange=${handleFileChange} class="file-input" />
                <label for="csv-upload" class="file-upload-label">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span>${fileName || 'Click to choose a .csv file'}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" onClick=${onCancel} disabled=${isProcessing}>Cancel</button>
            <button type="button" class="btn-primary" onClick=${handleImport} disabled=${!csvFile || isProcessing}>
              ${isProcessing ? 'Processing...' : 'Import Products'}
            </button>
          </div>
        ` : html`
          <div class="import-results">
            <h3>Import Complete</h3>
            <p class="summary-success">Successfully imported ${importResult.successCount} products.</p>
            ${importResult.errorCount > 0 && html`<p class="summary-error">Skipped ${importResult.errorCount} rows due to errors.</p>`}
            
            ${importResult.errors.length > 0 && html`
              <div class="error-details">
                <h4>Error Details:</h4>
                <ul>
                  ${importResult.errors.map(err => html`<li><strong>Row ${err.row}:</strong> ${err.message}</li>`)}
                </ul>
              </div>
            `}
          </div>
           <div class="form-actions">
            <button type="button" class="btn-primary" onClick=${onCancel}>Done</button>
          </div>
        `}
      </div>
    </div>
  `;
};

const ProductForm = ({ product, onSave, onCancel, brands, categories }) => {
  const [formData, setFormData] = useState(
    product || {
      name: '',
      brandId: '',
      category: '',
      subCategory: '',
      shade: '',
      stock: 0,
      price: 0,
      sellingPrice: 0,
      rrpPrice: 0,
      purchaseFrom: '',
      invoiceNo: '',
      keywords: '',
      description: '',
      imageUrl: '',
    }
  );
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [error, setError] = useState('');

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData(prev => ({...prev, imageUrl: reader.result}));
        };
        reader.readAsDataURL(file);
    }
  };

  const handleGenerateDescription = async () => {
    if (!formData.keywords) {
      setError('Please provide some keywords to generate a description.');
      return;
    }
    setError('');
    setIsGeneratingDesc(true);
    try {
      const brandName = brands.find(b => b.id == formData.brandId)?.name || '';
      const prompt = `Generate a compelling, short description for a college inventory item. Product details: Brand: '${brandName}', Name: '${formData.name}', Category: '${formData.category}', Sub-Category: '${formData.subCategory}'. Features: ${formData.keywords}. Keep it under 50 words.`;
      const response = await ai.models.generateContent({
        model: textModel,
        contents: prompt,
      });
      setFormData((prev) => ({ ...prev, description: response.text }));
    } catch (err) {
      console.error('Error generating description:', err);
      setError('Could not generate description. Please try again.');
    } finally {
      setIsGeneratingDesc(false);
    }
  };
  
  const handleGenerateImage = async () => {
    const { name, brandId, category, subCategory, shade, keywords } = formData;
    if (!name && !keywords) {
      setError('Please provide a name or keywords to generate an image.');
      return;
    }
    setError('');
    setIsGeneratingImage(true);
    try {
      const brandName = brands.find(b => b.id == brandId)?.name || '';
      const prompt = `A professional, clean studio photograph of a college inventory item. Product brand: '${brandName}', name: '${name}', category: '${category}', sub-category: '${subCategory}', variant/model: '${shade}'. Keywords: '${keywords}'. The product is on a minimalist, soft-focus background in a neutral color. Professional, educational institution branding.`;
      const response = await ai.models.generateImages({
        model: imageModel,
        prompt: prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
      });
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
      setFormData(prev => ({ ...prev, imageUrl }));

    // FIX: Corrected invalid `catch (err) => {` syntax to `catch (err) {`. The arrow function syntax is not permitted in a catch clause.
    } catch (err) {
      console.error('Error generating image:', err);
      setError('Could not generate image. Please try again.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.brandId || !formData.category || !formData.subCategory || formData.stock === '' || formData.price === '') {
        setError('Please fill in all required fields: Name, Brand, Category, Sub-Category, Stock, and Cost Price.');
        return;
    }
    onSave(formData);
  };

  return html`
    <div class="modal-overlay" onClick=${onCancel}>
      <div class="modal-content" onClick=${(e) => e.stopPropagation()}>
        <h2 class="modal-title">${product ? 'Edit' : 'Add New'} Product</h2>
        <form onSubmit=${handleSubmit}>
          <div class="form-grid">
            <div class="form-column">
              <div class="form-group">
                <label for="name">Product Name*</label>
                <input type="text" id="name" name="name" value=${formData.name} onInput=${handleInput} required />
              </div>
              <div class="form-group">
                <label for="brand">Brand*</label>
                 <select id="brand" name="brandId" value=${formData.brandId} onInput=${handleInput} required>
                    <option value="" disabled>Select a brand</option>
                    ${brands.map(b => html`<option value=${b.id}>${b.name}</option>`)}
                </select>
              </div>
              <div class="form-group">
                <label for="category">Category*</label>
                <select id="category" name="category" value=${formData.category} onInput=${handleInput} required>
                    <option value="" disabled>Select a category</option>
                    ${categories.map(c => html`<option value=${c.name}>${c.name}</option>`)}
                </select>
              </div>
              <div class="form-group">
                <label for="subCategory">Sub-Category*</label>
                <input type="text" id="subCategory" name="subCategory" value=${formData.subCategory} onInput=${handleInput} required />
              </div>
              <div class="form-group">
                <label for="shade">Variant/Model</label>
                <input type="text" id="shade" name="shade" value=${formData.shade} onInput=${handleInput} />
              </div>
              <div class="form-group">
                <label for="stock">Stock Quantity*</label>
                <input type="number" id="stock" name="stock" min="0" value=${formData.stock} onInput=${handleInput} required />
              </div>
              <div class="form-group">
                <label for="price">Cost Price ($)*</label>
                <input type="number" id="price" name="price" min="0" step="0.01" value=${formData.price} onInput=${handleInput} required />
              </div>
              <div class="form-group">
                <label for="sellingPrice">Selling Price ($)</label>
                <input type="number" id="sellingPrice" name="sellingPrice" min="0" step="0.01" value=${formData.sellingPrice} onInput=${handleInput} />
              </div>
              <div class="form-group">
                <label for="rrpPrice">RRP Price ($)</label>
                <input type="number" id="rrpPrice" name="rrpPrice" min="0" step="0.01" value=${formData.rrpPrice} onInput=${handleInput} />
              </div>
               <div class="form-group">
                <label for="purchaseFrom">Purchase From</label>
                <input type="text" id="purchaseFrom" name="purchaseFrom" value=${formData.purchaseFrom} onInput=${handleInput} />
              </div>
              <div class="form-group">
                <label for="invoiceNo">Invoice No.</label>
                <input type="text" id="invoiceNo" name="invoiceNo" value=${formData.invoiceNo} onInput=${handleInput} />
              </div>
            </div>
            <div class="form-column">
                <div class="form-group">
                    <label>Product Image</label>
                    <div class="image-preview-container">
                        ${formData.imageUrl 
                            ? html`<img src=${formData.imageUrl} alt="Product preview" class="image-preview" />` 
                            : html`<div class="image-preview-placeholder"><span>Image Preview</span></div>`
                        }
                    </div>
                    <input type="file" id="image" name="image" accept="image/*" onChange=${handleImageUpload} class="file-input" />
                    <label for="image" class="btn-secondary btn-file">Upload Image</label>
                    <button type="button" class="btn-secondary" onClick=${handleGenerateImage} disabled=${isGeneratingImage}>
                        ${isGeneratingImage ? 'Generating...' : '✨ Generate AI Image'}
                    </button>
                </div>
                 <div class="form-group">
                     <label for="keywords">Description Keywords</label>
                     <input type="text" id="keywords" name="keywords" value=${formData.keywords} onInput=${handleInput} placeholder="e.g., durable, blue ink, hardcover" />
                     <button type="button" class="btn-secondary" onClick=${handleGenerateDescription} disabled=${isGeneratingDesc}>
                        ${isGeneratingDesc ? 'Generating...' : '✨ Generate AI Description'}
                     </button>
                  </div>
                   <div class="form-group">
                      <label for="description">AI Generated Description</label>
                      <textarea id="description" name="description" value=${formData.description} onInput=${handleInput} rows="3" readonly></textarea>
                   </div>
            </div>
          </div>
          
          ${error && html`<p class="error-message">${error}</p>`}

          <div class="form-actions">
            <button type="button" class="btn-secondary" onClick=${onCancel}>Cancel</button>
            <button type="submit" class="btn-primary">Save Product</button>
          </div>
        </form>
      </div>
    </div>
  `;
};

const ProductCard = ({ product, onDelete, onEdit, hideActions = false, brands }) => {
  const brandName = brands.find(b => b.id === product.brandId)?.name || 'Unknown Brand';
  
  return html`
    <div class="product-card">
        ${product.imageUrl 
            ? html`<img src=${product.imageUrl} alt=${product.name} class="product-image" />`
            : html`<div class="product-image-placeholder"></div>`
        }
        <div class="product-card-content">
          <div class="card-header">
            <p class="product-brand">${brandName}</p>
            <h3 class="product-name">${product.name}</h3>
            <p class="product-category">${product.category} / ${product.subCategory}</p>
          </div>
          ${product.shade && html`<p class="product-shade">Model/Variant: ${product.shade}</p>`}
          <div class="card-details">
            <div class="detail-item">
              <span>Stock</span>
              <strong>${product.stock}</strong>
            </div>
            <div class="detail-item">
              <span>Cost</span>
              <strong>$${Number(product.price).toFixed(2)}</strong>
            </div>
            <div class="detail-item">
              <span>Selling</span>
              <strong>$${Number(product.sellingPrice || 0).toFixed(2)}</strong>
            </div>
            <div class="detail-item">
              <span>RRP</span>
              <strong>$${Number(product.rrpPrice || 0).toFixed(2)}</strong>
            </div>
          </div>
           ${(product.purchaseFrom || product.invoiceNo) && html`
            <div class="purchase-details">
                ${product.purchaseFrom && html`<span>From: <strong>${product.purchaseFrom}</strong></span>`}
                ${product.invoiceNo && html`<span>Invoice: <strong>${product.invoiceNo}</strong></span>`}
            </div>
           `}
          ${product.description && html`<p class="product-description">${product.description}</p>`}
          ${!hideActions && html`
              <div class="card-actions">
                <button class="btn-icon btn-edit" onClick=${() => onEdit(product)} aria-label="Edit product">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon" onClick=${() => onDelete(product.id)} aria-label="Delete product">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
          `}
      </div>
    </div>
  `;
};

const BrandForm = ({ brand, onSave, onCancel }) => {
  const [formData, setFormData] = useState(brand || { name: '', logoUrl: '' });
  const [error, setError] = useState('');

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData(prev => ({...prev, logoUrl: reader.result}));
        };
        reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Brand name is required.');
      return;
    }
    onSave(formData);
  };

  return html`
    <div class="modal-overlay" onClick=${onCancel}>
      <div class="modal-content" onClick=${(e) => e.stopPropagation()}>
        <h2 class="modal-title">${brand ? 'Edit' : 'Add New'} Brand</h2>
        <form onSubmit=${handleSubmit}>
            <div class="form-grid brand-form-grid">
              <div class="form-column">
                <div class="form-group">
                  <label for="brand-name">Brand Name*</label>
                  <input type="text" id="brand-name" name="name" value=${formData.name} onInput=${handleInput} required />
                </div>
              </div>
              <div class="form-column">
                <div class="form-group">
                    <label>Brand Logo</label>
                    <div class="image-preview-container">
                        ${formData.logoUrl 
                            ? html`<img src=${formData.logoUrl} alt="Brand logo preview" class="image-preview" />` 
                            : html`<div class="image-preview-placeholder"><span>Logo Preview</span></div>`
                        }
                    </div>
                    <input type="file" id="logo" name="logo" accept="image/*" onChange=${handleLogoUpload} class="file-input" />
                    <label for="logo" class="btn-secondary btn-file">Upload Logo</label>
                </div>
              </div>
            </div>
            ${error && html`<p class="error-message">${error}</p>`}
            <div class="form-actions">
              <button type="button" class="btn-secondary" onClick=${onCancel}>Cancel</button>
              <button type="submit" class="btn-primary">Save Brand</button>
            </div>
        </form>
      </div>
    </div>
  `;
};

const BrandCard = ({ brand, onEdit, onDelete }) => {
    return html`
        <div class="brand-card">
            <div class="brand-logo-container">
            ${brand.logoUrl
                ? html`<img src=${brand.logoUrl} alt=${`${brand.name} logo`} class="brand-logo" />`
                : html`<div class="brand-logo-placeholder">${brand.name.charAt(0)}</div>`
            }
            </div>
            <h3 class="brand-name">${brand.name}</h3>
            <div class="card-actions">
                <button class="btn-icon btn-edit" onClick=${() => onEdit(brand)} aria-label="Edit brand">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon" onClick=${() => onDelete(brand.id)} aria-label="Delete brand">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
        </div>
    `;
};

const UserForm = ({ user, onSave, onCancel }) => {
  const [formData, setFormData] = useState(user || { name: '', email: '', role: 'Staff', avatarUrl: '' });
  const [error, setError] = useState('');

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData(prev => ({...prev, avatarUrl: reader.result}));
        };
        reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setError('User name and email are required.');
      return;
    }
    onSave(formData);
  };

  return html`
    <div class="modal-overlay" onClick=${onCancel}>
      <div class="modal-content" onClick=${(e) => e.stopPropagation()}>
        <h2 class="modal-title">${user ? 'Edit' : 'Add New'} User</h2>
        <form onSubmit=${handleSubmit}>
            <div class="form-grid">
              <div class="form-column">
                 <div class="form-group">
                    <label>User Avatar</label>
                    <div class="image-preview-container">
                        ${formData.avatarUrl 
                            ? html`<img src=${formData.avatarUrl} alt="User avatar preview" class="image-preview" />` 
                            : html`<div class="image-preview-placeholder"><span>Avatar</span></div>`
                        }
                    </div>
                    <input type="file" id="avatar" name="avatar" accept="image/*" onChange=${handleAvatarUpload} class="file-input" />
                    <label for="avatar" class="btn-secondary btn-file">Upload Avatar</label>
                </div>
              </div>
              <div class="form-column">
                <div class="form-group">
                  <label for="user-name">Full Name*</label>
                  <input type="text" id="user-name" name="name" value=${formData.name} onInput=${handleInput} required />
                </div>
                <div class="form-group">
                  <label for="user-email">Email Address*</label>
                  <input type="email" id="user-email" name="email" value=${formData.email} onInput=${handleInput} required />
                </div>
                <div class="form-group">
                  <label for="user-role">Role*</label>
                  <select id="user-role" name="role" value=${formData.role} onInput=${handleInput}>
                    <option value="Staff">Staff</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              </div>
            </div>
            ${error && html`<p class="error-message">${error}</p>`}
            <div class="form-actions">
              <button type="button" class="btn-secondary" onClick=${onCancel}>Cancel</button>
              <button type="submit" class="btn-primary">Save User</button>
            </div>
        </form>
      </div>
    </div>
  `;
};

const UserCard = ({ user, onEdit, onDelete }) => {
    return html`
        <div class="user-card">
            <div class="user-avatar-container">
            ${user.avatarUrl
                ? html`<img src=${user.avatarUrl} alt=${`${user.name} avatar`} class="user-avatar" />`
                : html`<div class="user-avatar-placeholder">${user.name.charAt(0)}</div>`
            }
            </div>
            <div class="user-info">
                <h3 class="user-name">${user.name}</h3>
                <p class="user-email">${user.email}</p>
                <span class=${`user-role user-role-${user.role.toLowerCase()}`}>${user.role}</span>
            </div>
            <div class="card-actions">
                <button class="btn-icon btn-edit" onClick=${() => onEdit(user)} aria-label="Edit user">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon" onClick=${() => onDelete(user.id)} aria-label="Delete user">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        </div>
    `;
};

const CategoryForm = ({ category, onSave, onCancel }) => {
  const [formData, setFormData] = useState(category || { name: '', description: '' });
  const [error, setError] = useState('');

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Category name is required.');
      return;
    }
    onSave(formData);
  };

  return html`
    <div class="modal-overlay" onClick=${onCancel}>
      <div class="modal-content" onClick=${(e) => e.stopPropagation()}>
        <h2 class="modal-title">${category ? 'Edit' : 'Add New'} Category</h2>
        <form onSubmit=${handleSubmit}>
          <div class="form-group">
            <label for="cat-name">Category Name*</label>
            <input type="text" id="cat-name" name="name" value=${formData.name} onInput=${handleInput} required />
          </div>
          <div class="form-group">
            <label for="cat-desc">Description</label>
            <textarea id="cat-desc" name="description" value=${formData.description} onInput=${handleInput} rows="3"></textarea>
          </div>
          ${error && html`<p class="error-message">${error}</p>`}
          <div class="form-actions">
            <button type="button" class="btn-secondary" onClick=${onCancel}>Cancel</button>
            <button type="submit" class="btn-primary">Save Category</button>
          </div>
        </form>
      </div>
    </div>
  `;
};

const CategoryCard = ({ category, onEdit, onDelete }) => {
    return html`
        <div class="category-card">
            <div class="category-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            </div>
            <h3 class="category-name">${category.name}</h3>
            ${category.description && html`<p class="category-description">${category.description}</p>`}
            <div class="card-actions">
                <button class="btn-icon btn-edit" onClick=${() => onEdit(category)} aria-label="Edit category">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon" onClick=${() => onDelete(category.id)} aria-label="Delete category">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        </div>
    `;
};


const Summary = ({ products, brands, onAddProduct }) => {
    if (products.length === 0) {
        return html`
            <div class="empty-state">
                <h2>Welcome to Arya College!</h2>
                <p>Your inventory dashboard is ready. Add your first item to see a summary of your stock.</p>
                <button class="btn-primary" style=${{marginTop: '1.5rem'}} onClick=${onAddProduct}>+ Add First Item</button>
            </div>
        `;
    }

    const totalProducts = products.length;
    const totalValue = products.reduce((sum, p) => sum + (Number(p.price) * Number(p.stock)), 0);
    const outOfStock = products.filter(p => Number(p.stock) === 0).length;
    const latestProduct = products[products.length - 1];

    return html`
        <section class="summary-section">
            <div class="summary-stats">
                <div class="stat-card">
                    <h3>Total Items</h3>
                    <p>${totalProducts}</p>
                </div>
                <div class="stat-card">
                    <h3>Total Inventory Value</h3>
                    <p>$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div class="stat-card">
                    <h3>Out of Stock</h3>
                    <p>${outOfStock}</p>
                </div>
            </div>
            <div class="latest-product-section">
                <h2>Latest Addition</h2>
                ${latestProduct && html`<${ProductCard} product=${latestProduct} brands=${brands} hideActions=${true} />`}
            </div>
        </section>
    `;
};

const ReportsPage = ({ products, brands }) => {
  const [activeReport, setActiveReport] = useState('category');

  const categoryReportData = useMemo(() => {
    if (!products || products.length === 0) return [];
    // FIX: Typed the accumulator and cast the result of Object.values to ensure the array is typed, fixing 'unknown' errors.
    const categoryReports = products.reduce((acc, product) => {
        const category = product.category.trim() || 'Uncategorized';
        if (!acc[category]) {
            acc[category] = { name: category, productCount: 0, totalStock: 0, totalValue: 0 };
        }
        acc[category].productCount += 1;
        acc[category].totalStock += Number(product.stock);
        acc[category].totalValue += Number(product.stock) * Number(product.price);
        return acc;
    }, {} as Record<string, { name: string; productCount: number; totalStock: number; totalValue: number; }>);
    
    return (Object.values(categoryReports) as { name: string; productCount: number; totalStock: number; totalValue: number; }[])
        .sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const brandReportData = useMemo(() => {
    if (!products || products.length === 0) return [];
    // FIX: Typed the accumulator and cast the result of Object.values to ensure the array is typed, fixing 'unknown' errors.
    const brandReports = products.reduce((acc, product) => {
        const brandId = product.brandId;
        if (!brandId) return acc;
        if (!acc[brandId]) {
            const brandInfo = brands.find(b => b.id === brandId);
            acc[brandId] = { 
                id: brandId,
                name: brandInfo ? brandInfo.name : 'Unknown Brand',
                logoUrl: brandInfo ? brandInfo.logoUrl : '',
                productCount: 0, 
                totalStock: 0, 
                totalValue: 0 
            };
        }
        acc[brandId].productCount += 1;
        acc[brandId].totalStock += Number(product.stock);
        acc[brandId].totalValue += Number(product.stock) * Number(product.price);
        return acc;
    }, {} as Record<string, { id: any; name: string; logoUrl: string; productCount: number; totalStock: number; totalValue: number; }>);
    
    return (Object.values(brandReports) as { id: any; name: string; logoUrl: string; productCount: number; totalStock: number; totalValue: number; }[])
        .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, brands]);

  const handleExport = () => {
    // FIX: Cast to any[] to allow iteration over mixed types in this context without strict union checks.
    const dataToExport = (activeReport === 'category' ? categoryReportData : brandReportData) as any[];
    if (dataToExport.length === 0) return;

    const isBrandReport = activeReport === 'brand';
    const headers = [
        isBrandReport ? 'Brand' : 'Category',
        'Product Count',
        'Total Stock',
        'Total Value ($)'
    ];

    const csvRows = [headers.join(',')];

    for (const row of dataToExport) {
        const values = [
            `"${row.name.replace(/"/g, '""')}"`, // Handle quotes in names
            row.productCount,
            row.totalStock,
            row.totalValue.toFixed(2)
        ].join(',');
        csvRows.push(values);
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        const fileName = `${activeReport}-report-${new Date().toISOString().split('T')[0]}.csv`;
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  if (products.length === 0) {
      return html`
        <div class="empty-state">
            <h2>No Data for Reports</h2>
            <p>Add some items to your inventory to see reports here.</p>
        </div>
      `;
  }
  
  return html`
    <div class="reports-container">
      <div class="reports-header">
        <nav class="reports-nav" aria-label="Reports navigation">
          <button 
            class=${`btn-tab ${activeReport === 'category' ? 'active' : ''}`}
            onClick=${() => setActiveReport('category')}
            aria-pressed=${activeReport === 'category'}
          >
            By Category
          </button>
          <button
            class=${`btn-tab ${activeReport === 'brand' ? 'active' : ''}`}
            onClick=${() => setActiveReport('brand')}
            aria-pressed=${activeReport === 'brand'}
          >
            By Brand
          </button>
        </nav>
        <button 
            class="btn-secondary" 
            onClick=${handleExport}
            disabled=${(activeReport === 'category' && categoryReportData.length === 0) || (activeReport === 'brand' && brandReportData.length === 0)}
            aria-label="Export current report to CSV"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
        </button>
      </div>
      
      ${activeReport === 'category' && (
        categoryReportData.length > 0 ? html`
            <div class="report-grid">
              ${categoryReportData.map(report => html`
                <div class="report-card">
                  <h3>${report.name}</h3>
                  <div class="report-stats">
                    <div class="stat-item"><span>Items</span><strong>${report.productCount}</strong></div>
                    <div class="stat-item"><span>Total Stock</span><strong>${report.totalStock.toLocaleString()}</strong></div>
                    <div class="stat-item"><span>Total Value</span><strong>$${report.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  </div>
                </div>
              `)}
            </div>
        ` : html`<div class="empty-state"><p>No items with categories found.</p></div>`
      )}

      ${activeReport === 'brand' && (
        brandReportData.length > 0 ? html`
            <div class="report-grid">
              ${brandReportData.map(report => html`
                <div class="report-card brand-report-card">
                  <div class="brand-info">
                     ${report.logoUrl 
                        ? html`<img src=${report.logoUrl} alt=${`${report.name} logo`} />` 
                        : html`<div class="placeholder">${report.name.charAt(0)}</div>`
                     }
                     <h3>${report.name}</h3>
                  </div>
                  <div class="report-stats">
                    <div class="stat-item"><span>Items</span><strong>${report.productCount}</strong></div>
                    <div class="stat-item"><span>Total Stock</span><strong>${report.totalStock.toLocaleString()}</strong></div>
                    <div class="stat-item"><span>Total Value</span><strong>$${report.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  </div>
                </div>
              `)}
            </div>
        ` : html`<div class="empty-state"><p>No items assigned to brands found.</p></div>`
      )}
    </div>
  `;
};

const StockMovementsPage = ({ products, brands, stockMovements, onSave }) => {
    const [formData, setFormData] = useState({
        productId: products.length > 0 ? products[0].id : '',
        type: 'in',
        quantity: 1,
        notes: ''
    });
    const [error, setError] = useState('');

    const handleInput = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        // FIX: Ensure quantity is a string before parsing
        const quantity = parseInt(String(formData.quantity), 10);
        if (!formData.productId) {
            setError('Please select a product.');
            return;
        }
        if (isNaN(quantity) || quantity <= 0) {
            setError('Please enter a valid quantity greater than 0.');
            return;
        }
        
        const product = products.find(p => p.id == formData.productId);
        if (formData.type === 'out' && Number(product.stock) < quantity) {
            setError(`Cannot stock out ${quantity} items. Only ${product.stock} available.`);
            return;
        }

        onSave(formData);
        setFormData(prev => ({...prev, type: 'in', quantity: 1, notes: ''}));
    };
    
    const sortedMovements = useMemo(() => {
        // FIX: Explicitly convert Date objects to numbers using getTime() before subtraction, as direct subtraction of Date objects is not allowed in TypeScript.
        return [...stockMovements].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [stockMovements]);

    const getProductDetails = (productId) => {
        const product = products.find(p => p.id == productId);
        if (!product) return { name: 'Unknown Product', brandName: '' };
        const brand = brands.find(b => b.id === product.brandId);
        return {
            name: product.name,
            brandName: brand ? brand.name : 'Unknown Brand'
        };
    };

    return html`
    <div class="stock-movement-layout">
        <div class="movement-form-container">
            <h2 class="form-container-title">Record Stock Movement</h2>
            <form onSubmit=${handleSubmit}>
                <div class="form-group">
                    <label for="product-select">Product*</label>
                    <select id="product-select" name="productId" value=${formData.productId} onInput=${handleInput} required>
                        ${products.map(p => html`<option value=${p.id}>${p.name}</option>`)}
                    </select>
                </div>
                <div class="form-group">
                    <label for="type-select">Movement Type*</label>
                    <select id="type-select" name="type" value=${formData.type} onInput=${handleInput} required>
                        <option value="in">Stock In</option>
                        <option value="out">Stock Out</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="quantity">Quantity*</label>
                    <input type="number" id="quantity" name="quantity" min="1" value=${formData.quantity} onInput=${handleInput} required />
                </div>
                <div class="form-group">
                    <label for="notes">Notes/Reason</label>
                    <input type="text" id="notes" name="notes" value=${formData.notes} onInput=${handleInput} placeholder="e.g., Purchase from Supplier X" />
                </div>
                ${error && html`<p class="error-message" style=${{textAlign: 'left', marginTop: '0', marginBottom: '1rem'}}>${error}</p>`}
                <div class="form-actions" style=${{marginTop: '0'}}>
                    <button type="submit" class="btn-primary" style=${{width: '100%'}}>Record Movement</button>
                </div>
            </form>
        </div>
        <div class="movement-history-container">
            <h2>Movement History</h2>
            ${sortedMovements.length === 0 ? html`
                <div class="empty-state" style=${{padding: '2rem'}}>
                    <p>No stock movements have been recorded yet.</p>
                </div>
            ` : html`
                <ul class="history-list">
                    ${sortedMovements.map(m => {
                        const { name, brandName } = getProductDetails(m.productId);
                        return html`
                        <li class="history-item" key=${m.id}>
                            <div class="item-details">
                                <strong class="item-product-name">${name}</strong>
                                <span class="item-product-brand">${brandName}</span>
                                <span class="item-notes">${m.notes}</span>
                            </div>
                            <div class="item-meta">
                                <span class=${`movement-type movement-type-${m.type}`}>
                                    ${m.type === 'in' ? 'IN' : 'OUT'}: ${m.quantity}
                                </span>
                                <span class="item-date">${new Date(m.timestamp).toLocaleString()}</span>
                            </div>
                        </li>
                        `
                    })}
                </ul>
            `}
        </div>
    </div>
    `;
};


const Sidebar = ({ activeView, onNavigate }) => {
  const [isStockOpen, setIsStockOpen] = useState(true);

  const toggleStockMenu = (e) => {
    e.preventDefault();
    setIsStockOpen(prev => !prev);
  };

  const isStockSectionActive = ['products', 'brands', 'categories', 'stockMovements'].includes(activeView);

  return html`
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>Arya College</h2>
      </div>
      <nav class="nav-menu">
        <ul>
          <li>
            <a href="#" onClick=${(e) => { e.preventDefault(); onNavigate('dashboard'); }} class=${`nav-link ${activeView === 'dashboard' ? 'active' : ''}`} aria-current=${activeView === 'dashboard'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              <span>Dashboard</span>
            </a>
          </li>
          <li class="nav-item-group">
            <a href="#" onClick=${toggleStockMenu} class=${`nav-link has-submenu ${isStockSectionActive ? 'active-parent' : ''} ${isStockOpen ? 'open' : ''}`} aria-expanded=${isStockOpen}>
              <div class="nav-link-content">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                <span>Inventory</span>
              </div>
              <svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </a>
            ${isStockOpen && html`
              <ul class="submenu">
                <li>
                  <a href="#" onClick=${(e) => { e.preventDefault(); onNavigate('products'); }} class=${`nav-link ${activeView === 'products' ? 'active' : ''}`} aria-current=${activeView === 'products'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                    <span>All Items</span>
                  </a>
                </li>
                <li>
                  <a href="#" onClick=${(e) => { e.preventDefault(); onNavigate('brands'); }} class=${`nav-link ${activeView === 'brands' ? 'active' : ''}`} aria-current=${activeView === 'brands'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                    <span>Brands/Suppliers</span>
                  </a>
                </li>
                <li>
                  <a href="#" onClick=${(e) => { e.preventDefault(); onNavigate('categories'); }} class=${`nav-link ${activeView === 'categories' ? 'active' : ''}`} aria-current=${activeView === 'categories'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                    <span>Categories</span>
                  </a>
                </li>
                 <li>
                  <a href="#" onClick=${(e) => { e.preventDefault(); onNavigate('stockMovements'); }} class=${`nav-link ${activeView === 'stockMovements' ? 'active' : ''}`} aria-current=${activeView === 'stockMovements'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7 3 12l5 5"/><path d="m16 7 5 5-5 5"/><path d="M3 12h18"/></svg>
                    <span>Stock Movements</span>
                  </a>
                </li>
              </ul>
            `}
          </li>
          <li>
            <a href="#" onClick=${(e) => { e.preventDefault(); onNavigate('reports'); }} class=${`nav-link ${activeView === 'reports' ? 'active' : ''}`} aria-current=${activeView === 'reports'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20V16"/></svg>
                <span>Reports</span>
            </a>
          </li>
          <li>
            <a href="#" onClick=${(e) => { e.preventDefault(); onNavigate('users'); }} class=${`nav-link ${activeView === 'users' ? 'active' : ''}`} aria-current=${activeView === 'users'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span>Users</span>
            </a>
          </li>
          <li>
            <a href="#" onClick=${(e) => { e.preventDefault(); onNavigate('support'); }} class=${`nav-link ${activeView === 'support' ? 'active' : ''}`} aria-current=${activeView === 'support'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"></line><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"></line><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"></line><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"></line><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"></line></svg>
                <span>Support</span>
            </a>
          </li>
        </ul>
      </nav>
    </aside>
  `;
};

const App = () => {
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingBrand, setEditingBrand] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  
  useEffect(() => {
    // Load brands first, as they are needed for product migration.
    const savedBrands = localStorage.getItem('aryaCollegeBrands');
    const loadedBrands = savedBrands ? JSON.parse(savedBrands) : [];
    setBrands(loadedBrands);

    const savedCategories = localStorage.getItem('aryaCollegeCategories');
    const loadedCategories = savedCategories ? JSON.parse(savedCategories) : [
        { id: 1, name: 'Stationery', description: 'Pens, pencils, and other office supplies.' },
        { id: 2, name: 'Books & Textbooks', description: 'Educational books and reference materials.' },
        { id: 3, name: 'Electronics', description: 'Laptops, tablets, and other gadgets.' },
        { id: 4, name: 'Furniture', description: 'Desks, chairs, and classroom furniture.' },
        { id: 5, name: 'Lab Equipment', description: 'Scientific instruments and supplies.' },
        { id: 6, name: 'Sports', description: 'Gym equipment and sports gear.' }
    ];
    setCategories(loadedCategories);
    if (!savedCategories) {
        localStorage.setItem('aryaCollegeCategories', JSON.stringify(loadedCategories));
    }

    // Load and migrate products.
    const savedProducts = localStorage.getItem('aryaCollegeInventory');
    if (savedProducts) {
      const loadedProducts = JSON.parse(savedProducts);
      let migrationNeeded = false;
      const migratedProducts = loadedProducts.map(p => {
        // If product has a string `brand` but no `brandId`, migrate it.
        if (typeof p.brand === 'string' && !p.brandId) {
          migrationNeeded = true;
          const matchingBrand = loadedBrands.find(b => b.name.toLowerCase() === p.brand.toLowerCase());
          const { brand, ...rest } = p; // Remove old brand string property
          if (matchingBrand) {
            return { ...rest, brandId: matchingBrand.id };
          }
          return rest; // Return product without brand if no match found
        }
        return p;
      });
      
      if (migrationNeeded) {
        // Persist migrated data back to localStorage and update state
        localStorage.setItem('aryaCollegeInventory', JSON.stringify(migratedProducts));
        setProducts(migratedProducts);
      } else {
        setProducts(loadedProducts); // Just load into state if no migration was needed
      }
    }
    
    const savedUsers = localStorage.getItem('aryaCollegeUsers');
    if (savedUsers) {
        setUsers(JSON.parse(savedUsers));
    }
    
    const savedMovements = localStorage.getItem('aryaCollegeMovements');
    if (savedMovements) {
        setStockMovements(JSON.parse(savedMovements));
    }
  }, []);

  const saveProducts = (updatedProducts) => {
    setProducts(updatedProducts);
    localStorage.setItem('aryaCollegeInventory', JSON.stringify(updatedProducts));
  }
  
  const saveBrands = (updatedBrands) => {
    setBrands(updatedBrands);
    localStorage.setItem('aryaCollegeBrands', JSON.stringify(updatedBrands));
  }

  const saveCategories = (updatedCategories) => {
    setCategories(updatedCategories);
    localStorage.setItem('aryaCollegeCategories', JSON.stringify(updatedCategories));
  }
  
  const saveUsers = (updatedUsers) => {
    setUsers(updatedUsers);
    localStorage.setItem('aryaCollegeUsers', JSON.stringify(updatedUsers));
  }
  
  const saveStockMovements = (updatedMovements) => {
    setStockMovements(updatedMovements);
    localStorage.setItem('aryaCollegeMovements', JSON.stringify(updatedMovements));
  }

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(p => {
      const brand = brands.find(b => b.id === p.brandId);
      const brandName = brand ? brand.name.toLowerCase() : '';
      return (
        p.name.toLowerCase().includes(query) ||
        brandName.includes(query) ||
        (p.keywords && p.keywords.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.subCategory && p.subCategory.toLowerCase().includes(query))
      );
    });
  }, [products, brands, searchQuery]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };
  
  const handleOpenAddBrandModal = () => {
    setEditingBrand(null);
    setIsBrandModalOpen(true);
  }

  const handleOpenAddCategoryModal = () => {
    setEditingCategory(null);
    setIsCategoryModalOpen(true);
  };
  
  const handleOpenAddUserModal = () => {
    setEditingUser(null);
    setIsUserModalOpen(true);
  };
  
  const handleOpenImportModal = () => {
    setIsImportModalOpen(true);
  };

  const handleOpenEditModal = (product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };
  
  const handleOpenEditBrandModal = (brand) => {
    setEditingBrand(brand);
    setIsBrandModalOpen(true);
  };

  const handleOpenEditCategoryModal = (category) => {
    setEditingCategory(category);
    setIsCategoryModalOpen(true);
  };
  
  const handleOpenEditUserModal = (user) => {
    setEditingUser(user);
    setIsUserModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };
  
  const handleCloseBrandModal = () => {
    setIsBrandModalOpen(false);
    setEditingBrand(null);
  }

  const handleCloseCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
  };
  
  const handleCloseUserModal = () => {
    setIsUserModalOpen(false);
    setEditingUser(null);
  };
  
  const handleCloseImportModal = () => {
    setIsImportModalOpen(false);
  };
  
  const handleNavigate = (view) => {
    setActiveView(view);
    setSearchQuery('');
  }

  const handleSaveProduct = (productData) => {
    if (editingProduct) {
        const updatedProducts = products.map(p => p.id === editingProduct.id ? { ...p, ...productData } : p);
        saveProducts(updatedProducts);
    } else {
        const newProduct = { ...productData, id: Date.now() };
        saveProducts([...products, newProduct]);
    }
    handleCloseModal();
  };
  
  const handleSaveBrand = (brandData) => {
      const trimmedName = brandData.name.trim();
      if (!trimmedName) return;

      const isDuplicate = brands.some(b => {
        if (editingBrand) {
            return b.name.toLowerCase() === trimmedName.toLowerCase() && b.id !== editingBrand.id;
        }
        return b.name.toLowerCase() === trimmedName.toLowerCase();
      });

      if (isDuplicate) {
          alert('A brand with this name already exists.');
          return;
      }
      
      const finalBrandData = { ...brandData, name: trimmedName };

      if (editingBrand) {
          const updatedBrands = brands.map(b => b.id === editingBrand.id ? finalBrandData : b);
          saveBrands(updatedBrands);
      } else {
          const newBrand = { ...finalBrandData, id: Date.now() };
          saveBrands([...brands, newBrand]);
      }
      handleCloseBrandModal();
  }

  const handleSaveCategory = (categoryData) => {
    const trimmedName = categoryData.name.trim();
    if (!trimmedName) return;

    const isDuplicate = categories.some(c => {
      if (editingCategory) {
        return c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== editingCategory.id;
      }
      return c.name.toLowerCase() === trimmedName.toLowerCase();
    });

    if (isDuplicate) {
      alert('A category with this name already exists.');
      return;
    }

    const finalCategoryData = { ...categoryData, name: trimmedName };

    if (editingCategory) {
      const updatedCategories = categories.map(c => c.id === editingCategory.id ? finalCategoryData : c);
      saveCategories(updatedCategories);
    } else {
      const newCategory = { ...finalCategoryData, id: Date.now() };
      saveCategories([...categories, newCategory]);
    }
    handleCloseCategoryModal();
  };
  
  const handleSaveUser = (userData) => {
    if (editingUser) {
        const updatedUsers = users.map(u => u.id === editingUser.id ? { ...u, ...userData } : u);
        saveUsers(updatedUsers);
    } else {
        const newUser = { ...userData, id: Date.now() };
        saveUsers([...users, newUser]);
    }
    handleCloseUserModal();
  };
  
  const handleSaveStockMovement = (movementData) => {
    const { productId, type, notes } = movementData;
    const quantity = parseInt(movementData.quantity, 10);

    let productToUpdate = null;
    const updatedProducts = products.map(p => {
        if (p.id == productId) {
            const currentStock = Number(p.stock) || 0;
            const newStock = type === 'in' 
                ? currentStock + quantity 
                : currentStock - quantity;
            productToUpdate = { ...p, stock: newStock };
            return productToUpdate;
        }
        return p;
    });

    if (productToUpdate) {
        saveProducts(updatedProducts);

        const newMovement = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            productId,
            type,
            quantity,
            notes
        };
        saveStockMovements([newMovement, ...stockMovements]);
    }
  };

  const handleDeleteProduct = (id) => {
    if (confirm('Are you sure you want to delete this item?')) {
        const updatedProducts = products.filter(p => p.id !== id);
        saveProducts(updatedProducts);
    }
  };
  
  const handleDeleteBrand = (id) => {
    const brandToDelete = brands.find(b => b.id === id);
    if (!brandToDelete) return;

    // More reliable check using brandId
    const isBrandInUse = products.some(p => p.brandId === id);

    if (isBrandInUse) {
      alert(`The brand "${brandToDelete.name}" cannot be deleted because it is used by one or more products. Please reassign or delete those products first.`);
      return;
    }

    if (confirm(`Are you sure you want to delete the brand "${brandToDelete.name}"?`)) {
      const updatedBrands = brands.filter(b => b.id !== id);
      saveBrands(updatedBrands);
    }
  };

  const handleDeleteCategory = (id) => {
    const categoryToDelete = categories.find(c => c.id === id);
    if (!categoryToDelete) return;

    const isCategoryInUse = products.some(p => p.category === categoryToDelete.name);

    if (isCategoryInUse) {
      alert(`The category "${categoryToDelete.name}" cannot be deleted because it is used by one or more products. Please reassign or delete those products first.`);
      return;
    }

    if (confirm(`Are you sure you want to delete the category "${categoryToDelete.name}"?`)) {
      const updatedCategories = categories.filter(c => c.id !== id);
      saveCategories(updatedCategories);
    }
  };
  
  const handleDeleteUser = (id) => {
    if (confirm('Are you sure you want to delete this user?')) {
        const updatedUsers = users.filter(u => u.id !== id);
        saveUsers(updatedUsers);
    }
  };

  const handleImportProducts = (csvText) => {
    const newProducts = [];
    const errors = [];

    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) {
        errors.push({ row: 'File', message: 'CSV is empty or contains only a header.' });
        return { newProducts, errors };
    }
    
    const header = lines[0].split(',').map(h => h.trim());
    const requiredHeaders = ['name', 'brandName', 'category', 'subCategory', 'stock', 'price'];
    
    for (const req of requiredHeaders) {
        if (!header.includes(req)) {
            errors.push({ row: 'Header', message: `Missing required column: ${req}.` });
        }
    }
    if (errors.length > 0) {
        return { newProducts, errors };
    }

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const rowData = header.reduce((obj, col, index) => {
            obj[col] = values[index] ? values[index].trim() : '';
            return obj;
        }, {});

        const rowNum = i + 1;

        if (!rowData.name || !rowData.brandName || !rowData.category || !rowData.subCategory || !rowData.stock || !rowData.price) {
            errors.push({ row: rowNum, message: 'Missing one or more required fields.' });
            continue;
        }

        const stock = parseInt(rowData.stock, 10);
        const price = parseFloat(rowData.price);
        if (isNaN(stock) || isNaN(price)) {
            errors.push({ row: rowNum, message: 'Stock and Price must be valid numbers.' });
            continue;
        }
        
        const brand = brands.find(b => b.name.toLowerCase() === rowData.brandName.toLowerCase());
        if (!brand) {
            errors.push({ row: rowNum, message: `Brand "${rowData.brandName}" not found.` });
            continue;
        }

        const newProduct = {
            id: Date.now() + i,
            name: rowData.name,
            brandId: brand.id,
            category: rowData.category,
            subCategory: rowData.subCategory,
            shade: rowData.shade || '',
            stock: stock,
            price: price,
            sellingPrice: parseFloat(rowData.sellingPrice) || 0,
            rrpPrice: parseFloat(rowData.rrpPrice) || 0,
            purchaseFrom: rowData.purchaseFrom || '',
            invoiceNo: rowData.invoiceNo || '',
            keywords: rowData.keywords || '',
            description: rowData.description || '',
            imageUrl: '',
        };
        newProducts.push(newProduct);
    }
    
    if (newProducts.length > 0) {
        saveProducts([...products, ...newProducts]);
    }

    return { newProducts, errors };
  };
  
  const PageTitles = {
    dashboard: 'Dashboard',
    products: `All Items (${products.length})`,
    brands: `Brands / Suppliers (${brands.length})`,
    categories: 'Categories',
    stockMovements: 'Stock Movements',
    reports: 'Reports',
    users: `All Users (${users.length})`,
    support: 'Support & Contact'
  };

  return html`
    <div class="app-layout">
      <${Sidebar} activeView=${activeView} onNavigate=${handleNavigate} />
      <main class="main-content">
          <header class="app-header">
            <h1>${PageTitles[activeView]}</h1>
            <div class="header-actions">
                ${activeView === 'products' && html`
                    <div class="search-container">
                        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input 
                            type="text" 
                            class="search-input" 
                            placeholder="Search products..." 
                            value=${searchQuery}
                            onInput=${(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button class="btn-secondary" onClick=${handleOpenImportModal}>Import Items</button>
                    <button class="btn-primary" onClick=${handleOpenAddModal}>+ Add Item</button>
                `}
                ${activeView === 'brands' && html`<button class="btn-primary" onClick=${handleOpenAddBrandModal}>+ Add Brand</button>`}
                ${activeView === 'categories' && html`<button class="btn-primary" onClick=${handleOpenAddCategoryModal}>+ Add Category</button>`}
                ${activeView === 'users' && html`<button class="btn-primary" onClick=${handleOpenAddUserModal}>+ Add User</button>`}
            </div>
          </header>

          ${
            activeView === 'dashboard' ? html`<${Summary} products=${products} brands=${brands} onAddProduct=${handleOpenAddModal} />` :
            activeView === 'products' ? (
              products.length === 0 ? html`
                <div class="empty-state">
                  <h2>Your inventory is empty!</h2>
                  <p>Click "Add Item" to get started.</p>
                </div>
              ` : filteredProducts.length === 0 ? html`
                <div class="empty-state">
                  <h2>No products found</h2>
                  <p>Try adjusting your search query.</p>
                  <button class="btn-secondary" style=${{marginTop: '1rem'}} onClick=${() => setSearchQuery('')}>Clear Search</button>
                </div>
              ` : html`
                <div class="product-grid">
                  ${filteredProducts.map(
                    (p) => html`<${ProductCard} key=${p.id} product=${p} onDelete=${handleDeleteProduct} onEdit=${handleOpenEditModal} brands=${brands} />`
                  )}
                </div>
              `
            ) :
            activeView === 'brands' ? (
              brands.length === 0 ? html`
                <div class="empty-state">
                  <h2>No brands added yet.</h2>
                  <p>Click "+ Add Brand" to create your first one.</p>
                </div>
              ` : html`
                 <div class="brand-grid">
                  ${brands.map(
                    (b) => html`<${BrandCard} key=${b.id} brand=${b} onDelete=${handleDeleteBrand} onEdit=${handleOpenEditBrandModal} />`
                  )}
                </div>
              `
            ) :
            activeView === 'categories' ? (
              categories.length === 0 ? html`
                <div class="empty-state">
                  <h2>No categories added yet.</h2>
                  <p>Click "+ Add Category" to create your first one.</p>
                </div>
              ` : html`
                <div class="category-grid">
                  ${categories.map(cat => html`
                    <${CategoryCard} key=${cat.id} category=${cat} onEdit=${handleOpenEditCategoryModal} onDelete=${handleDeleteCategory} />
                  `)}
                </div>
              `
            ) : 
            activeView === 'stockMovements' ? html`
                <${StockMovementsPage} 
                    products=${products} 
                    brands=${brands} 
                    stockMovements=${stockMovements} 
                    onSave=${handleSaveStockMovement} />
            ` :
            activeView === 'reports' ? html`
                <${ReportsPage} products=${products} brands=${brands} />
            ` : 
            activeView === 'users' ? (
              users.length === 0 ? html`
                <div class="empty-state">
                  <h2>No users have been added.</h2>
                  <p>Click "+ Add User" to get started.</p>
                </div>
              ` : html`
                <div class="user-grid">
                  ${users.map(
                    (u) => html`<${UserCard} key=${u.id} user=${u} onDelete=${handleDeleteUser} onEdit=${handleOpenEditUserModal} />`
                  )}
                </div>
              `
            ) :
             activeView === 'support' ? html`
                <div class="support-page">
                    <h2>Contact Support</h2>
                    <p>If you need help or have any questions, please feel free to reach out.</p>
                    <div class="contact-card">
                        <h3>Gurdeep Kanda</h3>
                        <ul>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                <a href="mailto:contact@gurdeepkanda.com">contact@gurdeepkanda.com</a>
                            </li>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                <a href="tel:9780346001">9780346001</a>
                            </li>
                        </ul>
                    </div>
                </div>
            ` : null
          }
      </main>

      ${isModalOpen &&
      html`<${ProductForm} product=${editingProduct} onSave=${handleSaveProduct} onCancel=${handleCloseModal} brands=${brands} categories=${categories} />`}
      ${isBrandModalOpen &&
      html`<${BrandForm} brand=${editingBrand} onSave=${handleSaveBrand} onCancel=${handleCloseBrandModal} />`}
      ${isCategoryModalOpen &&
      html`<${CategoryForm} category=${editingCategory} onSave=${handleSaveCategory} onCancel=${handleCloseCategoryModal} />`}
      ${isUserModalOpen &&
      html`<${UserForm} user=${editingUser} onSave=${handleSaveUser} onCancel=${handleCloseUserModal} />`}
      ${isImportModalOpen &&
      html`<${ImportModal} onCancel=${handleCloseImportModal} onImport=${handleImportProducts} />`}
    </div>
  `;
};

render(html`<${App} />`, document.getElementById('app'));